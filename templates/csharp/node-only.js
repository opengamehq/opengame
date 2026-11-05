// Where index.html's import map sends `process` and `module`. The .NET runtime's
// _framework/dotnet.js imports both by bare name for Node. A browser running this starter
// never loads this file; the one unguarded import, flushing output on exit, runs only for
// a game that opts into withAsyncFlushOnExit, and the runtime catches its failure. They
// are mapped because a bare name with no map behind it is a build that cannot load, and
// opengame check refuses one. Failing here keeps the browser's answer the same as with no
// map at all: the import rejects.
throw new Error('process and module are Node modules, and this game runs in a browser.');
