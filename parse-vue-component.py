#!/usr/bin/env python3

import re
import json

def find_matching_brace(text, start_pos):
    """Find the matching closing brace for an opening brace at start_pos"""
    depth = 0
    i = start_pos
    in_string = False
    string_char = None

    while i < len(text):
        char = text[i]

        # Handle string literals
        if char in ['"', "'", '`'] and (i == 0 or text[i-1] != '\\'):
            if not in_string:
                in_string = True
                string_char = char
            elif char == string_char:
                in_string = False
                string_char = None

        if not in_string:
            if char == '{':
                depth += 1
            elif char == '}':
                depth -= 1
                if depth == 0:
                    return i

        i += 1

    return -1

def extract_template(content):
    """Extract the template section"""
    # Find template: \`
    match = re.search(r'template:\s*\\`', content)
    if not match:
        return None

    start = match.end()
    # Find the closing backtick
    depth = 0
    i = start
    while i < len(content):
        if content[i:i+2] == '\\`':
            i += 2
            continue
        if content[i] == '`' and content[i-1] != '\\':
            # Check if this is the end
            after = content[i+1:i+10]
            if ',' in after or '}' in after:
                template = content[start:i]
                # Unescape
                template = template.replace('\\`', '`').replace("\\'", "'").replace('\\$', '$')
                return template
        i += 1

    return None

def extract_section(content, section_name):
    """Extract a section like methods, computed, etc."""
    pattern = rf'{section_name}:\s*{{'
    match = re.search(pattern, content)
    if not match:
        return None

    start = match.end() - 1  # Include the opening brace
    end = find_matching_brace(content, start)
    if end == -1:
        return None

    return content[start+1:end]  # Exclude braces

def extract_data(content):
    """Extract the data function return object"""
    match = re.search(r'data\(\)\s*{\s*return\s*{', content)
    if not match:
        return None

    start = match.end() - 1  # Include the opening brace
    end = find_matching_brace(content, start)
    if end == -1:
        return None

    return content[start+1:end]  # Exclude braces

def extract_lifecycle(content, hook_name):
    """Extract a lifecycle hook like mounted, created, etc."""
    pattern = rf'{hook_name}\(\)\s*{{'
    match = re.search(pattern, content)
    if not match:
        return None

    start = match.end() - 1
    end = find_matching_brace(content, start)
    if end == -1:
        return None

    return content[start+1:end]

# Read the file
with open('frontend/extracted-dashboard.js', 'r') as f:
    content = f.read()

# Extract sections
template = extract_template(content)
data = extract_data(content)
computed = extract_section(content, 'computed')
methods = extract_section(content, 'methods')
mounted = extract_lifecycle(content, 'mounted')

# Save to files
if template:
    with open('frontend/vue-template.html', 'w') as f:
        f.write(template)
    print(f"✓ Extracted template ({len(template.splitlines())} lines)")

if data:
    with open('frontend/vue-data.js', 'w') as f:
        f.write(data)
    print(f"✓ Extracted data ({len(data.splitlines())} lines)")

if computed:
    with open('frontend/vue-computed.js', 'w') as f:
        f.write(computed)
    print(f"✓ Extracted computed ({len(computed.splitlines())} lines)")

if methods:
    with open('frontend/vue-methods.js', 'w') as f:
        f.write(methods)
    print(f"✓ Extracted methods ({len(methods.splitlines())} lines)")

if mounted:
    with open('frontend/vue-mounted.js', 'w') as f:
        f.write(mounted)
    print(f"✓ Extracted mounted ({len(mounted.splitlines())} lines)")

print("\nDone! Ready to assemble Vue component.")
