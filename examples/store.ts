import { StateStore } from '../src/core/store';
import { delay } from '../src/libs/utils';

interface ExampleStore {
  a: number;
  b?: string;
  c?: any;
  d: boolean;
  e: () => any;
  f: Array<any>;
  g?: ExampleStore
}

const initialState: ExampleStore = {
  a: 1,
  b: 'b',
  c: null,
  d: false,
  e: () => true,
  f: [0, 'a', true, null, () => true],
  g: {
    a: 1,
    b: 'b',
    c: null,
    d: false,
    e: () => true,
    f: [0, 'a', true, null],
  }
}

const store = new StateStore<ExampleStore>(initialState)

async function main() {
  const onAChange = store.watch('a', {skipInitialValue: true})

  onAChange.subscribe((val) => {
    console.log('xX got changed `a`', val)
  })

  store.watchSeveral(['a', 'g'], {skipInitialValue: true, debounceMS: 200}).subscribe((val) => {
    console.log('xX got changed `a` or `g`', val)
  })

  store.watchAll().subscribe((storeVal) => {
    console.log('xX storeVal changed', storeVal)
  })

  const initialG = store.get('g')! as any
  await delay(100)
  store.set('a', 10)
  await delay(100)
  store.set('g', {...initialG, 'a': 10})
  await delay(100)

  store.set('b', 'B')
  await delay(100)

  console.log('xX state', store.toObject())

  store.clear();
}



main().then(() => console.log('\n\ndone'))