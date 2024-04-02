# Tectonica

A simple collection of foundational elements used in modern app development

## @tectonica/store

A `Map` interface which exposes some methods to watch for changes. Currently utilizes rxjs, but an eventEmitter vesion based off the AbstractManager in this packages is likely coming soon

## @tectonica/manager

An `AbstractManager` concept which allow emitting and subscribing to events with specific keys, along with some react hooks and utils to create react hooks utilizing the managers.
Useful for sharing data across an application without triggering unnecessary re-renders.
based on a concept by [@kern](https://gist.github.com/kern) and utilizing [tseep](https://github.com/Morglod/tseep)

## @tectonica/utils

A toolbox of useful utilities as I collect them
