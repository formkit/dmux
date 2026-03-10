import AppKit
import ApplicationServices
import Dispatch
import Foundation

struct SubscribeMessage: Decodable {
    let type: String
    let instanceId: String
    let titleToken: String
    let bundleId: String?
    let terminalProgram: String?
}

struct FocusStateMessage: Encodable {
    let type = "focus-state"
    let instanceId: String
    let fullyFocused: Bool
    let accessibilityTrusted: Bool
    let matchedTitleToken: Bool
    let frontmostAppBundleId: String?
    let focusedWindowTitle: String?
}

struct FocusSnapshot: Equatable {
    let accessibilityTrusted: Bool
    let frontmostAppBundleId: String?
    let focusedWindowTitle: String?
}

struct FrontmostWindowInfo {
    let processIdentifier: pid_t
    let bundleId: String?
    let title: String?
}

final class ClientConnection {
    let fd: Int32
    private let queue: DispatchQueue
    private var source: DispatchSourceRead?
    private var buffer = Data()
    private var subscribeMessage: SubscribeMessage?
    private let onReady: (ClientConnection, SubscribeMessage) -> Void
    private let onClose: (ClientConnection) -> Void

    init(
        fd: Int32,
        queue: DispatchQueue,
        onReady: @escaping (ClientConnection, SubscribeMessage) -> Void,
        onClose: @escaping (ClientConnection) -> Void
    ) {
        self.fd = fd
        self.queue = queue
        self.onReady = onReady
        self.onClose = onClose
    }

    func start() {
        let source = DispatchSource.makeReadSource(fileDescriptor: fd, queue: queue)
        source.setEventHandler { [weak self] in
            self?.handleReadable()
        }
        source.setCancelHandler { [fd] in
            Darwin.close(fd)
        }
        self.source = source
        source.resume()
    }

    func send(snapshot: FocusSnapshot) {
        guard let subscribeMessage else {
            return
        }

        let matchedTitleToken = snapshot.focusedWindowTitle?.contains(subscribeMessage.titleToken) ?? false
        let bundleMatches: Bool
        if let expectedBundleId = subscribeMessage.bundleId, !expectedBundleId.isEmpty {
            bundleMatches = snapshot.frontmostAppBundleId == expectedBundleId
        } else {
            bundleMatches = true
        }

        let fullyFocused = snapshot.accessibilityTrusted && matchedTitleToken && bundleMatches
        let message = FocusStateMessage(
            instanceId: subscribeMessage.instanceId,
            fullyFocused: fullyFocused,
            accessibilityTrusted: snapshot.accessibilityTrusted,
            matchedTitleToken: matchedTitleToken,
            frontmostAppBundleId: snapshot.frontmostAppBundleId,
            focusedWindowTitle: snapshot.focusedWindowTitle
        )

        let encoder = JSONEncoder()
        guard let encoded = try? encoder.encode(message) else {
            return
        }

        var payload = encoded
        payload.append(0x0A)
        payload.withUnsafeBytes { rawBuffer in
            guard let baseAddress = rawBuffer.baseAddress else {
                return
            }
            _ = Darwin.write(fd, baseAddress, rawBuffer.count)
        }
    }

    func close() {
        source?.cancel()
        source = nil
        onClose(self)
    }

    private func handleReadable() {
        var chunk = [UInt8](repeating: 0, count: 4096)
        let bytesRead = Darwin.read(fd, &chunk, chunk.count)

        if bytesRead <= 0 {
            close()
            return
        }

        buffer.append(chunk, count: Int(bytesRead))
        guard subscribeMessage == nil else {
            return
        }

        guard let newlineIndex = buffer.firstIndex(of: 0x0A) else {
            return
        }

        let lineData = buffer.prefix(upTo: newlineIndex)
        buffer.removeSubrange(...newlineIndex)

        do {
            let message = try JSONDecoder().decode(SubscribeMessage.self, from: lineData)
            guard message.type == "subscribe" else {
                close()
                return
            }
            subscribeMessage = message
            onReady(self, message)
        } catch {
            close()
        }
    }
}

final class FocusMonitor {
    private let socketPath: String
    private let pollInterval: TimeInterval
    private let queue = DispatchQueue(label: "dmux.helper.focus", qos: .userInitiated)
    private var listenerFD: Int32 = -1
    private var listenerSource: DispatchSourceRead?
    private var timer: DispatchSourceTimer?
    private var clients: [Int32: ClientConnection] = [:]
    private var lastSnapshot: FocusSnapshot?
    private var didRequestAccessibilityPrompt = false

    init(socketPath: String, pollInterval: TimeInterval) {
        self.socketPath = socketPath
        self.pollInterval = pollInterval
    }

    func start() throws {
        try prepareSocket()
        startAcceptingConnections()
        startPolling()
    }

    private func prepareSocket() throws {
        let socketDirectory = URL(fileURLWithPath: socketPath).deletingLastPathComponent()
        try FileManager.default.createDirectory(at: socketDirectory, withIntermediateDirectories: true)

        if FileManager.default.fileExists(atPath: socketPath) {
            try FileManager.default.removeItem(atPath: socketPath)
        }

        listenerFD = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
        guard listenerFD >= 0 else {
            throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno))
        }

        var address = sockaddr_un()
        address.sun_family = sa_family_t(AF_UNIX)

        let maxPathLength = MemoryLayout.size(ofValue: address.sun_path)
        let utf8Path = socketPath.utf8CString
        guard utf8Path.count <= maxPathLength else {
            throw NSError(domain: "dmux.helper", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Socket path too long: \(socketPath)",
            ])
        }

        withUnsafeMutablePointer(to: &address.sun_path) { pathPointer in
            let rawPointer = UnsafeMutableRawPointer(pathPointer).assumingMemoryBound(to: CChar.self)
            _ = utf8Path.withUnsafeBufferPointer { bufferPointer in
                strncpy(rawPointer, bufferPointer.baseAddress, maxPathLength - 1)
            }
        }

        let addressLength = socklen_t(MemoryLayout<sa_family_t>.size + utf8Path.count)
        let bindResult = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockPointer in
                Darwin.bind(listenerFD, sockPointer, addressLength)
            }
        }

        guard bindResult == 0 else {
            throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno))
        }

        guard Darwin.listen(listenerFD, 16) == 0 else {
            throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno))
        }

        let currentFlags = fcntl(listenerFD, F_GETFL, 0)
        guard currentFlags >= 0, fcntl(listenerFD, F_SETFL, currentFlags | O_NONBLOCK) == 0 else {
            throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno))
        }
    }

    private func startAcceptingConnections() {
        let source = DispatchSource.makeReadSource(fileDescriptor: listenerFD, queue: queue)
        source.setEventHandler { [weak self] in
            self?.acceptPendingClients()
        }
        source.setCancelHandler { [listenerFD, socketPath] in
            if listenerFD >= 0 {
                Darwin.close(listenerFD)
            }
            try? FileManager.default.removeItem(atPath: socketPath)
        }
        listenerSource = source
        source.resume()
    }

    private func acceptPendingClients() {
        while true {
            let clientFD = Darwin.accept(listenerFD, nil, nil)
            if clientFD < 0 {
                if errno == EAGAIN || errno == EWOULDBLOCK {
                    return
                }
                return
            }

            let connection = ClientConnection(
                fd: clientFD,
                queue: queue,
                onReady: { [weak self] connection, _ in
                    guard let self else {
                        return
                    }
                    connection.send(snapshot: self.lastSnapshot ?? self.captureSnapshot())
                },
                onClose: { [weak self] connection in
                    self?.clients.removeValue(forKey: connection.fd)
                }
            )

            clients[connection.fd] = connection
            connection.start()
        }
    }

    private func startPolling() {
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now(), repeating: pollInterval)
        timer.setEventHandler { [weak self] in
            self?.pollFocusState()
        }
        self.timer = timer
        timer.resume()
    }

    private func pollFocusState() {
        let snapshot = snapshotForPolling()
        if snapshot != lastSnapshot {
            lastSnapshot = snapshot
            for client in clients.values {
                client.send(snapshot: snapshot)
            }
        }
    }

    private func snapshotForPolling() -> FocusSnapshot {
        if Thread.isMainThread {
            return captureSnapshot()
        }

        return DispatchQueue.main.sync {
            captureSnapshot()
        }
    }

    private func captureSnapshot() -> FocusSnapshot {
        let accessibilityTrusted: Bool
        if didRequestAccessibilityPrompt {
            accessibilityTrusted = AXIsProcessTrusted()
        } else {
            let trustOptions = [kAXTrustedCheckOptionPrompt.takeRetainedValue() as String: true] as CFDictionary
            accessibilityTrusted = AXIsProcessTrustedWithOptions(trustOptions)
            didRequestAccessibilityPrompt = true
        }

        let frontmostWindowInfo = captureFrontmostWindowInfo()
        let processIdentifier = frontmostWindowInfo?.processIdentifier
        let bundleId = frontmostWindowInfo?.bundleId
        let fallbackTitle = frontmostWindowInfo?.title

        guard accessibilityTrusted, let processIdentifier else {
            return FocusSnapshot(
                accessibilityTrusted: accessibilityTrusted,
                frontmostAppBundleId: bundleId,
                focusedWindowTitle: fallbackTitle
            )
        }

        let appElement = AXUIElementCreateApplication(processIdentifier)
        var focusedWindow: CFTypeRef?
        let focusedWindowResult = AXUIElementCopyAttributeValue(
            appElement,
            kAXFocusedWindowAttribute as CFString,
            &focusedWindow
        )

        guard focusedWindowResult == .success, let focusedWindowElement = focusedWindow else {
            return FocusSnapshot(
                accessibilityTrusted: accessibilityTrusted,
                frontmostAppBundleId: bundleId,
                focusedWindowTitle: fallbackTitle
            )
        }

        var titleValue: CFTypeRef?
        let titleResult = AXUIElementCopyAttributeValue(
            focusedWindowElement as! AXUIElement,
            kAXTitleAttribute as CFString,
            &titleValue
        )

        let title = titleResult == .success ? titleValue as? String : fallbackTitle
        return FocusSnapshot(
            accessibilityTrusted: accessibilityTrusted,
            frontmostAppBundleId: bundleId,
            focusedWindowTitle: title
        )
    }

    private func captureFrontmostWindowInfo() -> FrontmostWindowInfo? {
        let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
        guard let rawWindowList = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
            return nil
        }

        for windowInfo in rawWindowList {
            guard let ownerPID = windowInfo[kCGWindowOwnerPID as String] as? pid_t else {
                continue
            }

            let layer = windowInfo[kCGWindowLayer as String] as? Int ?? 0
            if layer != 0 {
                continue
            }

            let alpha = windowInfo[kCGWindowAlpha as String] as? Double ?? 1
            if alpha <= 0 {
                continue
            }

            if let bounds = windowInfo[kCGWindowBounds as String] as? [String: Any] {
                let width = bounds["Width"] as? Double ?? 0
                let height = bounds["Height"] as? Double ?? 0
                if width <= 0 || height <= 0 {
                    continue
                }
            }

            let title = windowInfo[kCGWindowName as String] as? String
            let bundleId = NSRunningApplication(processIdentifier: ownerPID)?.bundleIdentifier
            return FrontmostWindowInfo(
                processIdentifier: ownerPID,
                bundleId: bundleId,
                title: title
            )
        }

        return nil
    }
}

func parseArguments() -> (socketPath: String, pollMilliseconds: Int) {
    var socketPath = "\(NSHomeDirectory())/.dmux/native-helper/run/dmux-helper.sock"
    var pollMilliseconds = 250

    var iterator = CommandLine.arguments.dropFirst().makeIterator()
    while let argument = iterator.next() {
        switch argument {
        case "--socket":
            if let value = iterator.next() {
                socketPath = value
            }
        case "--poll-ms":
            if let value = iterator.next(), let parsedValue = Int(value) {
                pollMilliseconds = max(100, parsedValue)
            }
        default:
            continue
        }
    }

    return (socketPath, pollMilliseconds)
}

let arguments = parseArguments()
let monitor = FocusMonitor(
    socketPath: arguments.socketPath,
    pollInterval: TimeInterval(arguments.pollMilliseconds) / 1000.0
)

do {
    try monitor.start()
    dispatchMain()
} catch {
    fputs("dmux-helper failed to start: \(error)\n", stderr)
    exit(1)
}
