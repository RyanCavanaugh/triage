# Test LSP Example

Here's a simple TypeScript example to test LSP operations:

```typescript
// foo.ts
export function myFunction(param: string) {
    return param.toUpperCase();
}

// bar.ts
import { myFunction } from "./foo.js";
myFunction(/*!*/);
```

The `/*!*/` marker indicates where the LSP operation should be performed.