# Current Status

## The Problem
- Backspace key is acting like Delete key (forward delete instead of backward delete)
- This happens especially in multiline scenarios
- Standard ink-text-input doesn't support multiline at all

## Test Case
```
Type: hello[ENTER]world
Press: LEFT LEFT  (cursor between r and l)
Press: BACKSPACE BACKSPACE
Expected: hello\nwld
Actual: hello\nword (nothing deleted) or hello\nwo (deleted forward)
```

## What We've Tried
1. Standard ink-text-input - doesn't support multiline
2. Custom implementations - all have backspace acting as forward delete
3. Issue seems to be in cursor position tracking or slice logic

## Next Step
The backspace logic `value.slice(0, cursor - 1) + value.slice(cursor)` is correct.
The issue must be that the cursor position is not where we think it is.
We need to debug the actual cursor position when we press backspace.