import AppKit
import ApplicationServices
import Dispatch
import Foundation

private let helperBundleIconName = "dmux-helper"
private let notificationTitleTokenKey = "titleToken"
private let notificationBundleIdKey = "bundleId"
private let notificationTmuxPaneIdKey = "tmuxPaneId"
private let notificationTmuxSocketPathKey = "tmuxSocketPath"

struct SubscribeMessage: Decodable {
    let type: String
    let instanceId: String
    let titleToken: String
    let bundleId: String?
    let terminalProgram: String?
}

struct IncomingEnvelope: Decodable {
    let type: String
}

struct NotifyMessage: Decodable {
    let type: String
    let title: String
    let subtitle: String?
    let body: String
    let soundName: String?
    let titleToken: String?
    let bundleId: String?
    let tmuxPaneId: String?
    let tmuxSocketPath: String?
}

struct PreviewSoundMessage: Decodable {
    let type: String
    let soundName: String?
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

private struct PreparedNotificationSound {
    let notificationSoundName: String?
    let helperSound: NSSound?
}

final class ClientConnection {
    let fd: Int32
    private let queue: DispatchQueue
    private var source: DispatchSourceRead?
    private var buffer = Data()
    private var subscribeMessage: SubscribeMessage?
    private let onReady: (ClientConnection, SubscribeMessage) -> Void
    private let onNotify: (NotifyMessage) -> Void
    private let onPreviewSound: (PreviewSoundMessage) -> Void
    private let onClose: (ClientConnection) -> Void

    init(
        fd: Int32,
        queue: DispatchQueue,
        onReady: @escaping (ClientConnection, SubscribeMessage) -> Void,
        onNotify: @escaping (NotifyMessage) -> Void,
        onPreviewSound: @escaping (PreviewSoundMessage) -> Void,
        onClose: @escaping (ClientConnection) -> Void
    ) {
        self.fd = fd
        self.queue = queue
        self.onReady = onReady
        self.onNotify = onNotify
        self.onPreviewSound = onPreviewSound
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
            let envelope = try JSONDecoder().decode(IncomingEnvelope.self, from: lineData)
            switch envelope.type {
            case "subscribe":
                let message = try JSONDecoder().decode(SubscribeMessage.self, from: lineData)
                subscribeMessage = message
                onReady(self, message)
            case "notify":
                let message = try JSONDecoder().decode(NotifyMessage.self, from: lineData)
                onNotify(message)
                close()
            case "preview-sound":
                let message = try JSONDecoder().decode(PreviewSoundMessage.self, from: lineData)
                onPreviewSound(message)
                close()
            default:
                close()
            }
        } catch {
            close()
        }
    }
}

final class FocusMonitor: NSObject, NSUserNotificationCenterDelegate, NSSoundDelegate {
    private let socketPath: String
    private let pollInterval: TimeInterval
    private let queue = DispatchQueue(label: "dmux.helper.focus", qos: .userInitiated)
    private var listenerFD: Int32 = -1
    private var listenerSource: DispatchSourceRead?
    private var timer: DispatchSourceTimer?
    private var clients: [Int32: ClientConnection] = [:]
    private var lastSnapshot: FocusSnapshot?
    private var didRequestAccessibilityPrompt = false
    private var activeNotificationSounds: [ObjectIdentifier: NSSound] = [:]
    private var activePreviewSounds: [ObjectIdentifier: NSSound] = [:]
    private var activePreviewNotification: NSUserNotification?

    init(socketPath: String, pollInterval: TimeInterval) {
        self.socketPath = socketPath
        self.pollInterval = pollInterval
        super.init()
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
                onNotify: { [weak self] message in
                    DispatchQueue.main.async {
                        self?.deliverNotification(message)
                    }
                },
                onPreviewSound: { [weak self] message in
                    DispatchQueue.main.async {
                        self?.playPreviewSound(message)
                    }
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

    private func deliverNotification(_ message: NotifyMessage) {
        let title = message.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = message.body.trimmingCharacters(in: .whitespacesAndNewlines)
        let subtitle = message.subtitle?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !title.isEmpty, !body.isEmpty else {
            return
        }

        let center = NSUserNotificationCenter.default
        center.delegate = self

        // Bundled notification sounds are played by the helper because Notification Center
        // does not reliably honor custom NSUserNotification sounds on current macOS builds.
        let preparedSound = prepareNotificationSound(from: message.soundName)
        let notification = NSUserNotification()
        notification.identifier = UUID().uuidString
        notification.title = title
        notification.subtitle = subtitle
        notification.informativeText = body
        notification.soundName = preparedSound.notificationSoundName
        notification.deliveryDate = Date()

        let focusUserInfo = buildNotificationUserInfo(from: message)
        if !focusUserInfo.isEmpty {
            notification.userInfo = focusUserInfo
            notification.hasActionButton = true
            notification.actionButtonTitle = "Open"
            notification.otherButtonTitle = "Dismiss"
        }

        if let icon = loadAppIcon() {
            let identityImageSelector = NSSelectorFromString("set_identityImage:")
            if notification.responds(to: identityImageSelector) {
                notification.perform(identityImageSelector, with: icon)
            }

            let borderSelector = NSSelectorFromString("set_identityImageHasBorder:")
            if notification.responds(to: borderSelector) {
                notification.perform(borderSelector, with: NSNumber(value: false))
            }
        }

        center.deliver(notification)
        playPreparedNotificationSound(preparedSound.helperSound)
    }

    private func prepareNotificationSound(from requestedSoundName: String?) -> PreparedNotificationSound {
        guard let requestedSoundName else {
            return PreparedNotificationSound(
                notificationSoundName: NSUserNotificationDefaultSoundName,
                helperSound: nil
            )
        }

        let trimmedSoundName = requestedSoundName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedSoundName.isEmpty else {
            return PreparedNotificationSound(
                notificationSoundName: NSUserNotificationDefaultSoundName,
                helperSound: nil
            )
        }

        let nsSoundName = trimmedSoundName as NSString
        let resourceName = nsSoundName.deletingPathExtension
        let resourceExtension = nsSoundName.pathExtension.isEmpty ? nil : nsSoundName.pathExtension

        guard let bundledSoundPath = Bundle.main.path(forResource: resourceName, ofType: resourceExtension),
              let helperSound = NSSound(contentsOfFile: bundledSoundPath, byReference: true) else {
            return PreparedNotificationSound(
                notificationSoundName: NSUserNotificationDefaultSoundName,
                helperSound: nil
            )
        }

        helperSound.delegate = self
        return PreparedNotificationSound(
            notificationSoundName: nil,
            helperSound: helperSound
        )
    }

    private func playPreparedNotificationSound(_ helperSound: NSSound?) {
        guard let helperSound else {
            return
        }

        let soundId = ObjectIdentifier(helperSound)
        activeNotificationSounds[soundId] = helperSound
        if !helperSound.play() {
            activeNotificationSounds.removeValue(forKey: soundId)
        }
    }

    private func playPreviewSound(_ message: PreviewSoundMessage) {
        stopPreviewPlayback()

        let preparedSound = prepareNotificationSound(from: message.soundName)
        if let helperSound = preparedSound.helperSound {
            playPreparedPreviewSound(helperSound)
            return
        }

        guard preparedSound.notificationSoundName == NSUserNotificationDefaultSoundName else {
            return
        }

        let center = NSUserNotificationCenter.default
        center.delegate = self

        let notification = NSUserNotification()
        notification.identifier = UUID().uuidString
        notification.title = " "
        notification.informativeText = " "
        notification.soundName = NSUserNotificationDefaultSoundName
        notification.deliveryDate = Date()

        activePreviewNotification = notification
        center.deliver(notification)

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self, weak notification] in
            guard let self, let notification else {
                return
            }

            if self.activePreviewNotification === notification {
                center.removeDeliveredNotification(notification)
                self.activePreviewNotification = nil
            }
        }
    }

    private func playPreparedPreviewSound(_ helperSound: NSSound) {
        let soundId = ObjectIdentifier(helperSound)
        activePreviewSounds[soundId] = helperSound
        helperSound.delegate = self
        if !helperSound.play() {
            activePreviewSounds.removeValue(forKey: soundId)
        }
    }

    private func stopPreviewPlayback() {
        for previewSound in activePreviewSounds.values {
            previewSound.stop()
        }
        activePreviewSounds.removeAll()

        guard let previewNotification = activePreviewNotification else {
            return
        }

        NSUserNotificationCenter.default.removeDeliveredNotification(previewNotification)
        activePreviewNotification = nil
    }

    private func buildNotificationUserInfo(from message: NotifyMessage) -> [String: Any] {
        var userInfo: [String: Any] = [:]

        if let titleToken = message.titleToken?.trimmingCharacters(in: .whitespacesAndNewlines), !titleToken.isEmpty {
            userInfo[notificationTitleTokenKey] = titleToken
        }

        if let bundleId = message.bundleId?.trimmingCharacters(in: .whitespacesAndNewlines), !bundleId.isEmpty {
            userInfo[notificationBundleIdKey] = bundleId
        }

        if let tmuxPaneId = message.tmuxPaneId?.trimmingCharacters(in: .whitespacesAndNewlines), !tmuxPaneId.isEmpty {
            userInfo[notificationTmuxPaneIdKey] = tmuxPaneId
        }

        if let tmuxSocketPath = message.tmuxSocketPath?.trimmingCharacters(in: .whitespacesAndNewlines), !tmuxSocketPath.isEmpty {
            userInfo[notificationTmuxSocketPathKey] = tmuxSocketPath
        }

        return userInfo
    }

    private func loadAppIcon() -> NSImage? {
        if let icon = NSImage(named: helperBundleIconName) {
            return icon
        }

        guard let iconPath = Bundle.main.path(forResource: helperBundleIconName, ofType: "png") else {
            return nil
        }

        return NSImage(contentsOfFile: iconPath)
    }

    func userNotificationCenter(
        _ center: NSUserNotificationCenter,
        shouldPresent notification: NSUserNotification
    ) -> Bool {
        true
    }

    func userNotificationCenter(
        _ center: NSUserNotificationCenter,
        didActivate notification: NSUserNotification
    ) {
        defer {
            center.removeDeliveredNotification(notification)
        }

        switch notification.activationType {
        case .actionButtonClicked, .contentsClicked:
            activateNotificationTarget(notification)
        default:
            break
        }
    }

    func sound(_ sound: NSSound, didFinishPlaying aBool: Bool) {
        activeNotificationSounds.removeValue(forKey: ObjectIdentifier(sound))
        activePreviewSounds.removeValue(forKey: ObjectIdentifier(sound))
    }

    private func activateNotificationTarget(_ notification: NSUserNotification) {
        let userInfo = notification.userInfo ?? [:]
        let titleToken = userInfo[notificationTitleTokenKey] as? String
        let bundleId = userInfo[notificationBundleIdKey] as? String
        let tmuxPaneId = userInfo[notificationTmuxPaneIdKey] as? String
        let tmuxSocketPath = userInfo[notificationTmuxSocketPathKey] as? String

        if let bundleId, !bundleId.isEmpty {
            if let titleToken, !titleToken.isEmpty {
                _ = focusTerminalWindow(bundleId: bundleId, titleToken: titleToken)
            } else {
                _ = activateTerminalApplication(bundleId: bundleId)
            }
        }

        if let tmuxPaneId, !tmuxPaneId.isEmpty {
            selectTmuxPane(tmuxPaneId, socketPath: tmuxSocketPath)
        }
    }

    private func activateTerminalApplication(bundleId: String) -> Bool {
        let apps = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId)
        guard let app = apps.first else {
            return false
        }

        return app.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
    }

    private func focusTerminalWindow(bundleId: String, titleToken: String) -> Bool {
        let apps = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId)
        guard !apps.isEmpty else {
            return false
        }

        guard AXIsProcessTrusted() else {
            return activateTerminalApplication(bundleId: bundleId)
        }

        for app in apps {
            let appElement = AXUIElementCreateApplication(app.processIdentifier)
            guard let matchingWindow = findMatchingWindow(appElement: appElement, titleToken: titleToken) else {
                continue
            }

            _ = app.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
            _ = AXUIElementSetAttributeValue(appElement, kAXFocusedWindowAttribute as CFString, matchingWindow)
            _ = AXUIElementSetAttributeValue(matchingWindow, kAXMainAttribute as CFString, kCFBooleanTrue)
            _ = AXUIElementPerformAction(matchingWindow, kAXRaiseAction as CFString)
            return true
        }

        return activateTerminalApplication(bundleId: bundleId)
    }

    private func findMatchingWindow(appElement: AXUIElement, titleToken: String) -> AXUIElement? {
        var windowsValue: CFTypeRef?
        let result = AXUIElementCopyAttributeValue(
            appElement,
            kAXWindowsAttribute as CFString,
            &windowsValue
        )

        guard result == .success, let windows = windowsValue as? [AXUIElement] else {
            return nil
        }

        for window in windows {
            guard let title = copyStringAttribute(window, attribute: kAXTitleAttribute as CFString) else {
                continue
            }

            if title.contains(titleToken) {
                return window
            }
        }

        return nil
    }

    private func copyStringAttribute(_ element: AXUIElement, attribute: CFString) -> String? {
        var value: CFTypeRef?
        let result = AXUIElementCopyAttributeValue(element, attribute, &value)
        guard result == .success else {
            return nil
        }

        return value as? String
    }

    private func selectTmuxPane(_ paneId: String, socketPath: String?) {
        var arguments = ["tmux"]
        if let socketPath, !socketPath.isEmpty {
            arguments.append(contentsOf: ["-S", socketPath])
        }
        arguments.append(contentsOf: ["select-pane", "-t", paneId])

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = arguments
        process.standardOutput = nil
        process.standardError = nil
        try? process.run()
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

final class DmuxHelperAppDelegate: NSObject, NSApplicationDelegate {
    private let monitor: FocusMonitor

    init(monitor: FocusMonitor) {
        self.monitor = monitor
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApplication.shared.setActivationPolicy(.prohibited)

        if let icon = NSImage(named: helperBundleIconName)
            ?? Bundle.main.path(forResource: helperBundleIconName, ofType: "png").flatMap(NSImage.init(contentsOfFile:)) {
            NSApplication.shared.applicationIconImage = icon
        }

        do {
            try monitor.start()
        } catch {
            fputs("dmux-helper failed to start: \(error)\n", stderr)
            NSApp.terminate(nil)
        }
    }
}

let arguments = parseArguments()
let monitor = FocusMonitor(
    socketPath: arguments.socketPath,
    pollInterval: TimeInterval(arguments.pollMilliseconds) / 1000.0
)

let app = NSApplication.shared
let delegate = DmuxHelperAppDelegate(monitor: monitor)
app.delegate = delegate
app.run()
