// Test the backspace logic directly without UI

let value = '';
let cursor = 0;

function type(text: string) {
  const before = value.slice(0, cursor);
  const after = value.slice(cursor);
  value = before + text + after;
  cursor += text.length;
  console.log(`TYPE "${text}": cursor=${cursor-text.length} -> ${cursor}, value="${value}"`);
}

function enter() {
  const before = value.slice(0, cursor);
  const after = value.slice(cursor);
  value = before + '\n' + after;
  cursor += 1;
  console.log(`ENTER: cursor=${cursor-1} -> ${cursor}, value="${value.replace(/\n/g, '\\n')}"`);
}

function left() {
  cursor = Math.max(0, cursor - 1);
  console.log(`LEFT: cursor -> ${cursor}, char at cursor="${value[cursor] || 'EOF'}"`);
}

function backspace() {
  if (cursor > 0) {
    const charToDelete = value[cursor - 1];
    const before = value.slice(0, cursor - 1);
    const after = value.slice(cursor);
    value = before + after;
    cursor -= 1;
    console.log(`BACKSPACE: deleted="${charToDelete}", cursor=${cursor+1} -> ${cursor}, value="${value.replace(/\n/g, '\\n')}"`);
  } else {
    console.log(`BACKSPACE: cursor=${cursor}, nothing to delete`);
  }
}

// Run the exact test case
console.log('\n=== TEST: Type "hello" ENTER "world" LEFT LEFT BACKSPACE BACKSPACE ===\n');

type('hello');
enter();
type('world');
console.log(`\nBefore navigation: value="${value.replace(/\n/g, '\\n')}", cursor=${cursor}`);

left();
left();
console.log(`\nAfter LEFT LEFT: cursor=${cursor}, should be between 'r' and 'l'`);
console.log(`Characters around cursor: [${value[cursor-1]}][cursor]>[${value[cursor]}]`);

backspace();
console.log(`After first backspace: value="${value.replace(/\n/g, '\\n')}"`);
console.log(`Should have deleted 'r', result should be "hello\\nwold"`);

backspace();
console.log(`After second backspace: value="${value.replace(/\n/g, '\\n')}"`);
console.log(`Should have deleted 'o', result should be "hello\\nwld"`);

console.log(`\n=== EXPECTED: "hello\\nwld" ===`);
console.log(`=== ACTUAL: "${value.replace(/\n/g, '\\n')}" ===`);
console.log(`=== TEST ${value === "hello\nwld" ? 'PASSED ✓' : 'FAILED ✗'} ===`);