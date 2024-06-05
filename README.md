# Tectonica

A simple collection of foundational elements used in modern app development

## @tectonica/store

A `Map` interface which exposes some methods to watch for changes. Currently utilizes rxjs, but an eventEmitter vesion based off the AbstractManager in this repo is likely coming soon

## @tectonica/manager

An `AbstractManager` concept which allow emitting and subscribing to events with specific keys, along with some react hooks and utils to create react hooks utilizing the managers.
Useful for sharing data across an application without triggering unnecessary re-renders.
based on a concept by [@kern](https://github.com/kern) and utilizing [tseep](https://github.com/Morglod/tseep)

## @tectonica/vm

WASM-based VM system using quickjs-emscripten. JS code can be eval-ed in the WASM sandbox, and the sandbox can be configured to expose specific browser built-ins along with custom code.

## @tectonica/utils

A toolbox of useful utilities as I collect them
