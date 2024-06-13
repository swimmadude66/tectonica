# @tectonica/vm

## Install

```bash
pnpm install @tectonica/vm
```

## Usage

```typescript
import { VMManager } from '@tectonica/vm'
// create a new manager
const vm = new VMManager()
// initialize the runtime/contexts
await vm.init()

// eval simple code
const result = vm.eval(`6 + 4`) // returns 10

// eval with context
const scopedResult = vm.scopedEval(`num1 + num2`, { num1: 3, num2: 2 }) // returns 5

// register globals
vm.registerVMGlobal('global1', {
  test: () => {
    console.log('hello!')
    return 12
  },
})
// access globals in future evals
const globalresult = vm.eval(`global1()`) // logs `hello` and returns 12
```

## Bundlers

If your project is bundled with something like Vite, you may need to specify the wasmLocation for where the file ends up after bundling

```typescript
import { VMManager } from '@tectonica/vm'
import wasmLocation from '@jitl/quickjs-wasmfile-release-sync/wasm?url'

const vm = new VMManager()
await vm.init({
  variantOptions: {
    wasmLocation,
  },
})
```
