#!/usr/bin/env bun
import { F as canonicalParameters, I as defineEvalMatrix, m as registerEvals, n as authoringId } from "./src-D9EZ9WiG.mjs";
import { a as readTrialEvents, c as readTrialSummary, i as readRunSummary, l as localReportStore, n as runMatrix, o as readTrialManifest, r as readRunManifest, t as runEval } from "./src-DFYKSBol.mjs";
import * as Schema from "effect/Schema";
import { Effect, Option } from "effect";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import * as Path from "node:path";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";
import * as OS from "node:os";
import * as Crypto from "node:crypto";
import * as NFS from "node:fs";
import { existsSync } from "node:fs";
import * as NodeUrl from "node:url";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as Arr from "effect/Array";
import * as ConfigError from "effect/ConfigError";
import * as Console from "effect/Console";
import * as Effect$1 from "effect/Effect";
import * as Either$1 from "effect/Either";
import { constUndefined, dual, identity, pipe } from "effect/Function";
import * as Inspectable from "effect/Inspectable";
import * as Option$1 from "effect/Option";
import "effect/ParseResult";
import * as Pipeable from "effect/Pipeable";
import { pipeArguments } from "effect/Pipeable";
import * as Predicate from "effect/Predicate";
import * as Ref from "effect/Ref";
import * as Brand from "effect/Brand";
import * as Context from "effect/Context";
import { GenericTag } from "effect/Context";
import * as Data$1 from "effect/Data";
import { TaggedError } from "effect/Data";
import * as Channel from "effect/Channel";
import * as Chunk from "effect/Chunk";
import * as Layer from "effect/Layer";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as Equal from "effect/Equal";
import * as Hash from "effect/Hash";
import * as List from "effect/List";
import * as Redacted from "effect/Redacted";
import * as EffectSecret from "effect/Secret";
import * as Effectable from "effect/Effectable";
import * as Match from "effect/Match";
import * as EffectNumber from "effect/Number";
import * as LogLevel from "effect/LogLevel";
import * as Config from "effect/Config";
import * as HashMap from "effect/HashMap";
import * as Order from "effect/Order";
import * as Logger from "effect/Logger";
import * as Unify from "effect/Unify";
import * as HashSet from "effect/HashSet";
import * as SynchronizedRef from "effect/SynchronizedRef";
import { globalValue } from "effect/GlobalValue";
import "effect/Cause";
import * as FiberRef from "effect/FiberRef";
import * as Schedule from "effect/Schedule";
import * as Scope$1 from "effect/Scope";
import * as Tracer from "effect/Tracer";
import * as Runtime from "effect/Runtime";
import * as Exit$1 from "effect/Exit";
import * as Mailbox from "effect/Mailbox";
import * as Deferred from "effect/Deferred";
import * as FiberSet from "effect/FiberSet";
import "effect/Fiber";
import "effect/Pool";
import * as MutableRef from "effect/MutableRef";
import { parseArgs } from "node:util";
import * as ChildProcess from "node:child_process";
import * as RcRef from "effect/RcRef";
import * as readline from "node:readline";
import { Hono } from "hono";
//#region ../../node_modules/.bun/@effect+cli@0.77.2+74e017304edf4bf0/node_modules/@effect/cli/dist/esm/internal/completion.js
/** @internal */
const escapeSingleQuoted = (string) => string.replaceAll("'", "'\\''");
//#endregion
//#region ../../node_modules/.bun/@effect+platform@0.97.2+452b06a93f937da4/node_modules/@effect/platform/dist/esm/Error.js
/**
* @since 1.0.0
* @category type id
*/
const TypeId$5 = /*#__PURE__*/ Symbol.for("@effect/platform/Error");
/**
* @since 1.0.0
* @category Models
*/
const Module = /*#__PURE__*/ Schema.Literal("Clipboard", "Command", "FileSystem", "KeyValueStore", "Path", "Stream", "Terminal");
/**
* @since 1.0.0
* @category Models
*/
var BadArgument = class extends (/*#__PURE__*/ Schema.TaggedError("@effect/platform/Error/BadArgument")("BadArgument", {
	module: Module,
	method: Schema.String,
	description: /*#__PURE__*/ Schema.optional(Schema.String),
	cause: /*#__PURE__*/ Schema.optional(Schema.Defect)
})) {
	/**
	* @since 1.0.0
	*/
	[TypeId$5] = TypeId$5;
	/**
	* @since 1.0.0
	*/
	get message() {
		return `${this.module}.${this.method}${this.description ? `: ${this.description}` : ""}`;
	}
};
/**
* @since 1.0.0
* @category Model
*/
const SystemErrorReason = /*#__PURE__*/ Schema.Literal("AlreadyExists", "BadResource", "Busy", "InvalidData", "NotFound", "PermissionDenied", "TimedOut", "UnexpectedEof", "Unknown", "WouldBlock", "WriteZero");
/**
* @since 1.0.0
* @category models
*/
var SystemError = class extends (/*#__PURE__*/ Schema.TaggedError("@effect/platform/Error/SystemError")("SystemError", {
	reason: SystemErrorReason,
	module: Module,
	method: Schema.String,
	description: /*#__PURE__*/ Schema.optional(Schema.String),
	syscall: /*#__PURE__*/ Schema.optional(Schema.String),
	pathOrDescriptor: /*#__PURE__*/ Schema.optional(/*#__PURE__*/ Schema.Union(Schema.String, Schema.Number)),
	cause: /*#__PURE__*/ Schema.optional(Schema.Defect)
})) {
	/**
	* @since 1.0.0
	*/
	[TypeId$5] = TypeId$5;
	/**
	* @since 1.0.0
	*/
	get message() {
		return `${this.reason}: ${this.module}.${this.method}${this.pathOrDescriptor !== void 0 ? ` (${this.pathOrDescriptor})` : ""}${this.description ? `: ${this.description}` : ""}`;
	}
};
//#endregion
//#region ../../node_modules/.bun/@effect+platform@0.97.2+452b06a93f937da4/node_modules/@effect/platform/dist/esm/internal/fileSystem.js
/** @internal */
const tag$1 = /*#__PURE__*/ GenericTag("@effect/platform/FileSystem");
/** @internal */
const Size$1 = (bytes) => typeof bytes === "bigint" ? bytes : BigInt(bytes);
const bigint1024 = /*#__PURE__*/ BigInt(1024);
bigint1024 * bigint1024 * bigint1024 * bigint1024 * bigint1024;
/** @internal */
const make$8 = (impl) => {
	return tag$1.of({
		...impl,
		exists: (path) => pipe(impl.access(path), Effect$1.as(true), Effect$1.catchTag("SystemError", (e) => e.reason === "NotFound" ? Effect$1.succeed(false) : Effect$1.fail(e))),
		readFileString: (path, encoding) => Effect$1.tryMap(impl.readFile(path), {
			try: (_) => new TextDecoder(encoding).decode(_),
			catch: (cause) => new BadArgument({
				module: "FileSystem",
				method: "readFileString",
				description: "invalid encoding",
				cause
			})
		}),
		stream: (path, options) => pipe(impl.open(path, { flag: "r" }), options?.offset ? Effect$1.tap((file) => file.seek(options.offset, "start")) : identity, Effect$1.map((file) => stream(file, options)), Stream.unwrapScoped),
		sink: (path, options) => pipe(impl.open(path, {
			flag: "w",
			...options
		}), Effect$1.map((file) => Sink.forEach((_) => file.writeAll(_))), Sink.unwrapScoped),
		writeFileString: (path, data, options) => Effect$1.flatMap(Effect$1.try({
			try: () => new TextEncoder().encode(data),
			catch: (cause) => new BadArgument({
				module: "FileSystem",
				method: "writeFileString",
				description: "could not encode string",
				cause
			})
		}), (_) => impl.writeFile(path, _, options))
	});
};
/** @internal */
const stream = (file, { bufferSize = 16, bytesToRead: bytesToRead_, chunkSize: chunkSize_ = Size$1(65536) } = {}) => {
	const bytesToRead = bytesToRead_ !== void 0 ? Size$1(bytesToRead_) : void 0;
	const chunkSize = Size$1(chunkSize_);
	function loop(totalBytesRead) {
		if (bytesToRead !== void 0 && bytesToRead <= totalBytesRead) return Channel.void;
		const toRead = bytesToRead !== void 0 && bytesToRead - totalBytesRead < chunkSize ? bytesToRead - totalBytesRead : chunkSize;
		return Channel.flatMap(file.readAlloc(toRead), Option$1.match({
			onNone: () => Channel.void,
			onSome: (buf) => Channel.flatMap(Channel.write(Chunk.of(buf)), (_) => loop(totalBytesRead + BigInt(buf.length)))
		}));
	}
	return Stream.bufferChunks(Stream.fromChannel(loop(BigInt(0))), { capacity: bufferSize });
};
//#endregion
//#region ../../node_modules/.bun/@effect+platform@0.97.2+452b06a93f937da4/node_modules/@effect/platform/dist/esm/FileSystem.js
/**
* @since 1.0.0
*/
/**
* @since 1.0.0
* @category sizes
*/
const Size = Size$1;
/**
* @since 1.0.0
* @category tag
*/
const FileSystem = tag$1;
/**
* @since 1.0.0
* @category constructor
*/
const make$7 = make$8;
/**
* @since 1.0.0
* @category type id
*/
const FileTypeId = /*#__PURE__*/ Symbol.for("@effect/platform/FileSystem/File");
/**
* @since 1.0.0
* @category constructor
*/
const FileDescriptor = /*#__PURE__*/ Brand.nominal();
/**
* @since 1.0.0
* @category constructor
*/
const WatchEventCreate = /*#__PURE__*/ Data$1.tagged("Create");
/**
* @since 1.0.0
* @category constructor
*/
const WatchEventUpdate = /*#__PURE__*/ Data$1.tagged("Update");
/**
* @since 1.0.0
* @category constructor
*/
const WatchEventRemove = /*#__PURE__*/ Data$1.tagged("Remove");
/**
* @since 1.0.0
* @category file watcher
*/
var WatchBackend = class extends (/*#__PURE__*/ Context.Tag("@effect/platform/FileSystem/WatchBackend")()) {};
//#endregion
//#region ../../node_modules/.bun/@effect+typeclass@0.41.0+452b06a93f937da4/node_modules/@effect/typeclass/dist/esm/internal/Iterable.js
/** @internal */
function reduce(b, f) {
	return function(iterable) {
		if (Array.isArray(iterable)) return iterable.reduce(f, b);
		let result = b;
		for (const n of iterable) result = f(result, n);
		return result;
	};
}
/** @internal */
function map$5(f) {
	return function(iterable) {
		if (Array.isArray(iterable)) return iterable.map(f);
		return function* () {
			for (const n of iterable) yield f(n);
		}();
	};
}
//#endregion
//#region ../../node_modules/.bun/@effect+typeclass@0.41.0+452b06a93f937da4/node_modules/@effect/typeclass/dist/esm/Product.js
/**
* @since 0.24.0
*/
const struct$2 = (F) => (fields) => {
	const keys = Object.keys(fields);
	return F.imap(F.productAll(keys.map((k) => fields[k])), (values) => {
		const out = {};
		for (let i = 0; i < values.length; i++) out[keys[i]] = values[i];
		return out;
	}, (r) => keys.map((k) => r[k]));
};
//#endregion
//#region ../../node_modules/.bun/@effect+typeclass@0.41.0+452b06a93f937da4/node_modules/@effect/typeclass/dist/esm/Semigroup.js
/**
* @since 0.24.0
*/
/**
* The `combineMany` parameter is optional and defaults to a standard
* implementation. You can provide a custom implementation when performance
* optimizations are possible.
*
* @category constructors
* @since 0.24.0
*/
const make$6 = (combine, combineMany = (self, collection) => reduce(self, combine)(collection)) => ({
	combine,
	combineMany
});
/**
* @category constructors
* @since 0.24.0
*/
const constant = (a) => make$6(() => a, () => a);
/**
* Always return the first argument.
*
* @category instances
* @since 0.24.0
*/
const first = () => make$6((a) => a, (a) => a);
/**
* @since 0.24.0
*/
const imap = /*#__PURE__*/ dual(3, (S, to, from) => make$6((self, that) => to(S.combine(from(self), from(that))), (self, collection) => to(S.combineMany(from(self), map$5(from)(collection)))));
const product = (self, that) => make$6(([xa, xb], [ya, yb]) => [self.combine(xa, ya), that.combine(xb, yb)]);
const productAll = (collection) => {
	return make$6((x, y) => {
		const len = Math.min(x.length, y.length);
		const out = [];
		let collectionLength = 0;
		for (const s of collection) {
			if (collectionLength >= len) break;
			out.push(s.combine(x[collectionLength], y[collectionLength]));
			collectionLength++;
		}
		return out;
	});
};
const productMany = (self, collection) => {
	const semigroup = productAll(collection);
	return make$6((x, y) => [self.combine(x[0], y[0]), ...semigroup.combine(x.slice(1), y.slice(1))]);
};
/**
* @category instances
* @since 0.24.0
*/
const Product = {
	of: constant,
	imap,
	product,
	productMany,
	productAll
};
/**
* Given a type `A`, this function creates and returns a `Semigroup` for `ReadonlyArray<A>`.
* The returned `Semigroup` combines two arrays by concatenating them.
*
* @category combinators
* @since 0.24.0
*/
const array$1 = () => make$6((self, that) => self.concat(that));
/**
* This function creates and returns a new `Semigroup` for a struct of values based on the given `Semigroup`s for each property in the struct.
* The returned `Semigroup` combines two structs of the same type by applying the corresponding `Semigroup` passed as arguments to each property in the struct.
*
* It is useful when you need to combine two structs of the same type and you have a specific way of combining each property of the struct.
*
* @category combinators
* @since 0.24.0
*/
const struct$1 = /*#__PURE__*/ struct$2(Product);
//#endregion
//#region ../../node_modules/.bun/@effect+typeclass@0.41.0+452b06a93f937da4/node_modules/@effect/typeclass/dist/esm/Monoid.js
/**
* @category constructors
* @since 0.24.0
*/
const fromSemigroup = (S, empty) => ({
	combine: S.combine,
	combineMany: S.combineMany,
	empty,
	combineAll: (collection) => S.combineMany(empty, collection)
});
/**
* Given a type `A`, this function creates and returns a `Semigroup` for `ReadonlyArray<A>`.
*
* The `empty` value is the empty array.
*
* @category combinators
* @since 0.24.0
*/
const array = () => fromSemigroup(array$1(), []);
/**
* This function creates and returns a new `Monoid` for a struct of values based on the given `Monoid`s for each property in the struct.
* The returned `Monoid` combines two structs of the same type by applying the corresponding `Monoid` passed as arguments to each property in the struct.
*
* The `empty` value of the returned `Monoid` is a struct where each property is the `empty` value of the corresponding `Monoid` in the input `monoids` object.
*
* It is useful when you need to combine two structs of the same type and you have a specific way of combining each property of the struct.
*
* @category combinators
* @since 0.24.0
*/
const struct = (fields) => {
	const empty = {};
	for (const k in fields) if (Object.prototype.hasOwnProperty.call(fields, k)) empty[k] = fields[k].empty;
	return fromSemigroup(struct$1(fields), empty);
};
//#endregion
//#region ../../node_modules/.bun/@effect+printer-ansi@0.51.0+4e526cd47ba32532/node_modules/@effect/printer-ansi/dist/esm/internal/color.js
/** @internal */
const black = { _tag: "Black" };
/** @internal */
const red$3 = { _tag: "Red" };
/** @internal */
const green$2 = { _tag: "Green" };
/** @internal */
const magenta$1 = { _tag: "Magenta" };
/** @internal */
const cyan$1 = { _tag: "Cyan" };
/** @internal */
const white$3 = { _tag: "White" };
/** @internal */
const toCode$1 = (color) => {
	switch (color._tag) {
		case "Black": return 0;
		case "Red": return 1;
		case "Green": return 2;
		case "Yellow": return 3;
		case "Blue": return 4;
		case "Magenta": return 5;
		case "Cyan": return 6;
		case "White": return 7;
	}
};
//#endregion
//#region ../../node_modules/.bun/@effect+printer-ansi@0.51.0+4e526cd47ba32532/node_modules/@effect/printer-ansi/dist/esm/internal/sgr.js
/** @internal */
const reset = { _tag: "Reset" };
/** @internal */
const setBold = (bold) => ({
	_tag: "SetBold",
	bold
});
/** @internal */
const setColor = (color, vivid, layer) => ({
	_tag: "SetColor",
	color,
	vivid,
	layer
});
/** @internal */
const setItalicized = (italicized) => ({
	_tag: "SetItalicized",
	italicized
});
/** @internal */
const setStrikethrough = (strikethrough) => ({
	_tag: "SetStrikethrough",
	strikethrough
});
/** @internal */
const setUnderlined = (underlined) => ({
	_tag: "SetUnderlined",
	underlined
});
/** @internal */
const toCode = (self) => {
	switch (self._tag) {
		case "Reset": return 0;
		case "SetBold": return self.bold ? 1 : 22;
		case "SetColor": switch (self.layer) {
			case "foreground": return self.vivid ? 90 + toCode$1(self.color) : 30 + toCode$1(self.color);
			case "background": return self.vivid ? 100 + toCode$1(self.color) : 40 + toCode$1(self.color);
		}
		case "SetItalicized": return self.italicized ? 3 : 23;
		case "SetStrikethrough": return self.strikethrough ? 9 : 29;
		case "SetUnderlined": return self.underlined ? 4 : 24;
	}
};
/** @internal */
const toEscapeSequence = (sgrs) => csi("m", sgrs);
const csi = (controlFunction, sgrs) => {
	return `\u001b[${Array.from(sgrs).map((sgr) => `${toCode(sgr)}`).join(";")}${controlFunction}`;
};
/** @internal */
const AnsiTypeId = /*#__PURE__*/ Symbol.for("@effect/printer-ansi/Ansi");
const make$5 = (params) => ({
	...AnsiMonoid.empty,
	...params
});
const typeIdSemigroup = /*#__PURE__*/ first();
const getFirstSomeSemigroup = /*#__PURE__*/ make$6((self, that) => Option$1.isSome(self) ? self : that);
const AnsiSemigroup = /*#__PURE__*/ struct$1({
	[AnsiTypeId]: typeIdSemigroup,
	commands: /*#__PURE__*/ array$1(),
	foreground: getFirstSomeSemigroup,
	background: getFirstSomeSemigroup,
	bold: getFirstSomeSemigroup,
	italicized: getFirstSomeSemigroup,
	strikethrough: getFirstSomeSemigroup,
	underlined: getFirstSomeSemigroup
});
const typeIdMonoid = /*#__PURE__*/ fromSemigroup(typeIdSemigroup, AnsiTypeId);
const monoidOrElse = /*#__PURE__*/ fromSemigroup(getFirstSomeSemigroup, /*#__PURE__*/ Option$1.none());
const AnsiMonoid = /*#__PURE__*/ struct({
	[AnsiTypeId]: typeIdMonoid,
	commands: /*#__PURE__*/ array(),
	foreground: monoidOrElse,
	background: monoidOrElse,
	bold: monoidOrElse,
	italicized: monoidOrElse,
	strikethrough: monoidOrElse,
	underlined: monoidOrElse
});
/** @internal */
const none$2 = AnsiMonoid.empty;
const ESC = "\x1B[";
const BEL = "\x07";
const SEP = ";";
/** @internal */
const bold$1 = /*#__PURE__*/ make$5({ bold: /*#__PURE__*/ Option$1.some(/*#__PURE__*/ setBold(true)) });
/** @internal */
const italicized$1 = /*#__PURE__*/ make$5({ italicized: /*#__PURE__*/ Option$1.some(/*#__PURE__*/ setItalicized(true)) });
/** @internal */
const strikethrough$1 = /*#__PURE__*/ make$5({ strikethrough: /*#__PURE__*/ Option$1.some(/*#__PURE__*/ setStrikethrough(true)) });
/** @internal */
const underlined$1 = /*#__PURE__*/ make$5({ underlined: /*#__PURE__*/ Option$1.some(/*#__PURE__*/ setUnderlined(true)) });
/** @internal */
const brightColor = (color) => make$5({ foreground: Option$1.some(setColor(color, true, "foreground")) });
/** @internal */
const color$1 = (color) => make$5({ foreground: Option$1.some(setColor(color, false, "foreground")) });
/** @internal */
const red$2 = /*#__PURE__*/ color$1(red$3);
/** @internal */
const green$1 = /*#__PURE__*/ color$1(green$2);
/** @internal */
const white$2 = /*#__PURE__*/ color$1(white$3);
/** @internal */
const blackBright$1 = /*#__PURE__*/ brightColor(black);
/** @internal */
const cyanBright$1 = /*#__PURE__*/ brightColor(cyan$1);
/** @internal */
const beep$2 = /*#__PURE__*/ make$5({ commands: /*#__PURE__*/ Arr.of(BEL) });
/** @internal */
const cursorTo$2 = (column, row) => {
	if (row === void 0) {
		const command = `${ESC}${Math.max(column + 1, 0)}G`;
		return make$5({ commands: Arr.of(command) });
	}
	const command = `${ESC}${row + 1}${SEP}${Math.max(column + 1, 0)}H`;
	return make$5({ commands: Arr.of(command) });
};
/** @internal */
const cursorMove$2 = (column, row = 0) => {
	let command = "";
	if (row < 0) command += `${ESC}${-row}A`;
	if (row > 0) command += `${ESC}${row}B`;
	if (column > 0) command += `${ESC}${column}C`;
	if (column < 0) command += `${ESC}${-column}D`;
	return make$5({ commands: Arr.of(command) });
};
/** @internal */
const cursorDown$2 = (lines = 1) => {
	const command = `${ESC}${lines}B`;
	return make$5({ commands: Arr.of(command) });
};
/** @internal */
const cursorLeft$2 = /*#__PURE__*/ make$5({ commands: /*#__PURE__*/ Arr.of(`${ESC}G`) });
/** @internal */
const cursorSavePosition$2 = /*#__PURE__*/ make$5({ commands: /*#__PURE__*/ Arr.of(`${ESC}s`) });
/** @internal */
const cursorRestorePosition$2 = /*#__PURE__*/ make$5({ commands: /*#__PURE__*/ Arr.of(`${ESC}u`) });
/** @internal */
const cursorHide$2 = /*#__PURE__*/ make$5({ commands: /*#__PURE__*/ Arr.of(`${ESC}?25l`) });
/** @internal */
const cursorShow$2 = /*#__PURE__*/ make$5({ commands: /*#__PURE__*/ Arr.of(`${ESC}?25h`) });
/** @internal */
const eraseLines$2 = (rows) => {
	let command = "";
	for (let i = 0; i < rows; i++) command += `${ESC}2K` + (i < rows - 1 ? `${ESC}1A` : "");
	if (rows > 0) command += `${ESC}G`;
	return make$5({ commands: Arr.of(command) });
};
/** @internal */
const eraseLine$2 = /*#__PURE__*/ make$5({ commands: /*#__PURE__*/ Arr.of(`${ESC}2K`) });
/** @internal */
const stringify = (self) => stringifyInternal(self);
/** @internal */
const combine$1 = /*#__PURE__*/ dual(2, (self, that) => combineInternal(self, that));
const combineInternal = (self, that) => AnsiSemigroup.combine(self, that);
const stringifyInternal = (self) => {
	return `${toEscapeSequence(Arr.getSomes([
		Option$1.some(reset),
		self.foreground,
		self.background,
		self.bold,
		self.italicized,
		self.strikethrough,
		self.underlined
	]))}${Arr.join(self.commands, "")}`;
};
//#endregion
//#region ../../node_modules/.bun/@effect+printer-ansi@0.51.0+4e526cd47ba32532/node_modules/@effect/printer-ansi/dist/esm/Ansi.js
/**
* @since 1.0.0
* @category constructors
*/
const bold = bold$1;
/**
* @since 1.0.0
* @category constructors
*/
const italicized = italicized$1;
/**
* @since 1.0.0
* @category constructors
*/
const strikethrough = strikethrough$1;
/**
* @since 1.0.0
* @category constructors
*/
const underlined = underlined$1;
/**
* @since 1.0.0
* @category constructors
*/
const color = color$1;
/**
* @since 1.0.0
* @category colors
*/
const red$1 = red$2;
/**
* @since 1.0.0
* @category colors
*/
const green = green$1;
/**
* @since 1.0.0
* @category colors
*/
const white$1 = white$2;
/**
* @since 1.0.0
* @category colors
*/
const blackBright = blackBright$1;
/**
* @since 1.0.0
* @category colors
*/
const cyanBright = cyanBright$1;
/**
* @since 1.0.0
* @categrory combinators
*/
const combine = combine$1;
//#endregion
//#region ../../node_modules/.bun/@effect+printer@0.51.0+4e526cd47ba32532/node_modules/@effect/printer/dist/esm/internal/flatten.js
const FlattenSymbolKey = "@effect/printer/Flatten";
/** @internal */
const FlattenTypeId = /*#__PURE__*/ Symbol.for(FlattenSymbolKey);
const protoHash$3 = {
	Flattened: (self) => Hash.combine(Hash.hash(self.value))(Hash.string(FlattenSymbolKey)),
	AlreadyFlat: (_) => Hash.combine(Hash.string("@effect/printer/Flattened/AlreadyFlat"))(Hash.string(FlattenSymbolKey)),
	NeverFlat: (_) => Hash.combine(Hash.string("@effect/printer/Flattened/NeverFlat"))(Hash.string(FlattenSymbolKey))
};
const protoEqual$3 = {
	Flattened: (self, that) => isFlatten(that) && that._tag === "Flattened" && Equal.equals(self.value, that.value),
	AlreadyFlat: (_, that) => isFlatten(that) && that._tag === "AlreadyFlat",
	NeverFlat: (_, that) => isFlatten(that) && that._tag === "NeverFlat"
};
const proto$10 = {
	[FlattenTypeId]: { _A: (_) => _ },
	[Hash.symbol]() {
		return Hash.cached(this, protoHash$3[this._tag](this));
	},
	[Equal.symbol](that) {
		return protoEqual$3[this._tag](this, that);
	}
};
/** @internal */
const isFlatten = (u) => typeof u === "object" && u != null && FlattenTypeId in u;
/** @internal */
const isFlattened = (self) => self._tag === "Flattened";
/** @internal */
const isAlreadyFlat = (self) => self._tag === "AlreadyFlat";
/** @internal */
const isNeverFlat = (self) => self._tag === "NeverFlat";
/** @internal */
const flattened = (value) => (() => {
	const op = Object.create(proto$10);
	op._tag = "Flattened";
	op.value = value;
	return op;
})();
/** @internal */
const alreadyFlat = /*#__PURE__*/ (() => {
	const op = /*#__PURE__*/ Object.create(proto$10);
	op._tag = "AlreadyFlat";
	return op;
})();
/** @internal */
const neverFlat = /*#__PURE__*/ (() => {
	const op = /*#__PURE__*/ Object.create(proto$10);
	op._tag = "NeverFlat";
	return op;
})();
/** @internal */
const map$4 = /*#__PURE__*/ dual(2, (self, f) => {
	switch (self._tag) {
		case "Flattened": return flattened(f(self.value));
		case "AlreadyFlat": return alreadyFlat;
		case "NeverFlat": return neverFlat;
	}
});
//#endregion
//#region ../../node_modules/.bun/@effect+printer@0.51.0+4e526cd47ba32532/node_modules/@effect/printer/dist/esm/internal/doc.js
const DocSymbolKey = "@effect/printer/Doc";
/** @internal */
const DocTypeId = /*#__PURE__*/ Symbol.for(DocSymbolKey);
const protoHash$2 = {
	Fail: (_) => Hash.combine(Hash.hash(DocSymbolKey))(Hash.hash("@effect/printer/Doc/Fail")),
	Empty: (_) => Hash.combine(Hash.hash(DocSymbolKey))(Hash.hash("@effect/printer/Doc/Empty")),
	Char: (self) => Hash.combine(Hash.hash(DocSymbolKey))(Hash.string(self.char)),
	Text: (self) => Hash.combine(Hash.hash(DocSymbolKey))(Hash.string(self.text)),
	Line: (_) => Hash.combine(Hash.hash(DocSymbolKey))(Hash.hash("@effect/printer/Doc/Line")),
	FlatAlt: (self) => Hash.combine(Hash.hash(DocSymbolKey))(Hash.combine(Hash.hash(self.left))(Hash.hash(self.right))),
	Cat: (self) => Hash.combine(Hash.hash(DocSymbolKey))(Hash.combine(Hash.hash(self.left))(Hash.hash(self.right))),
	Nest: (self) => Hash.combine(Hash.hash(DocSymbolKey))(Hash.combine(Hash.hash(self.indent))(Hash.hash(self.doc))),
	Union: (self) => Hash.combine(Hash.hash(DocSymbolKey))(Hash.combine(Hash.hash(self.left))(Hash.hash(self.right))),
	Column: (self) => Hash.combine(Hash.hash(DocSymbolKey))(Hash.hash(self.react)),
	WithPageWidth: (self) => Hash.combine(Hash.hash(DocSymbolKey))(Hash.hash(self.react)),
	Nesting: (self) => Hash.combine(Hash.hash(DocSymbolKey))(Hash.hash(self.react)),
	Annotated: (self) => Hash.combine(Hash.hash(DocSymbolKey))(Hash.combine(Hash.hash(self.annotation))(Hash.hash(self.doc)))
};
const protoEqual$2 = {
	Fail: (_, that) => isDoc(that) && that._tag === "Fail",
	Empty: (_, that) => isDoc(that) && that._tag === "Empty",
	Char: (self, that) => isDoc(that) && that._tag === "Char" && self.char === that.char,
	Text: (self, that) => isDoc(that) && that._tag === "Text" && self.text === that.text,
	Line: (_, that) => isDoc(that) && that._tag === "Line",
	FlatAlt: (self, that) => isDoc(that) && that._tag === "FlatAlt" && Equal.equals(that.left)(self.left) && Equal.equals(that.right)(self.right),
	Cat: (self, that) => isDoc(that) && that._tag === "Cat" && Equal.equals(that.left)(self.left) && Equal.equals(that.right)(self.right),
	Nest: (self, that) => isDoc(that) && that._tag === "Nest" && self.indent === that.indent && Equal.equals(that.doc)(self.doc),
	Union: (self, that) => isDoc(that) && that._tag === "Union" && Equal.equals(that.left)(self.left) && Equal.equals(that.right)(self.right),
	Column: (self, that) => isDoc(that) && that._tag === "Column" && Equal.equals(that.react)(self.react),
	WithPageWidth: (self, that) => isDoc(that) && that._tag === "WithPageWidth" && Equal.equals(that.react)(self.react),
	Nesting: (self, that) => isDoc(that) && that._tag === "Nesting" && Equal.equals(that.react)(self.react),
	Annotated: (self, that) => isDoc(that) && that._tag === "Annotated" && Equal.equals(that.annotation)(self.annotation) && Equal.equals(that.doc)(self.doc)
};
const proto$9 = {
	[DocTypeId]: { _A: (_) => _ },
	[Hash.symbol]() {
		return Hash.cached(this, protoHash$2[this._tag](this));
	},
	[Equal.symbol](that) {
		return protoEqual$2[this._tag](this, that);
	},
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const isDoc = (u) => typeof u === "object" && u != null && DocTypeId in u;
/** @internal */
const isEmpty$4 = (self) => self._tag === "Empty";
/** @internal */
const isChar = (self) => self._tag === "Char";
/** @internal */
const isText$1 = (self) => self._tag === "Text";
/** @internal */
const isCat = (self) => self._tag === "Cat";
/** @internal */
const isNest = (self) => self._tag === "Nest";
/** @internal */
const char$2 = (char) => {
	const op = Object.create(proto$9);
	op._tag = "Char";
	op.char = char;
	return op;
};
/** @internal */
const text$9 = (text) => {
	const op = Object.create(proto$9);
	op._tag = "Text";
	op.text = text;
	return op;
};
/** @internal */
const flatAlt = /*#__PURE__*/ dual(2, (self, that) => {
	const op = Object.create(proto$9);
	op._tag = "FlatAlt";
	op.left = self;
	op.right = that;
	return op;
});
/** @internal */
const union = /*#__PURE__*/ dual(2, (self, that) => {
	const op = Object.create(proto$9);
	op._tag = "Union";
	op.left = self;
	op.right = that;
	return op;
});
/** @internal */
const cat$1 = /*#__PURE__*/ dual(2, (self, that) => {
	const op = Object.create(proto$9);
	op._tag = "Cat";
	op.left = self;
	op.right = that;
	return op;
});
/** @internal */
const empty$5 = /*#__PURE__*/ (() => {
	const op = /*#__PURE__*/ Object.create(proto$9);
	op._tag = "Empty";
	return op;
})();
/** @internal */
const fail = /*#__PURE__*/ (() => {
	const op = /*#__PURE__*/ Object.create(proto$9);
	op._tag = "Fail";
	return op;
})();
/** @internal */
const hardLine$1 = /*#__PURE__*/ (() => {
	const op = /*#__PURE__*/ Object.create(proto$9);
	op._tag = "Line";
	return op;
})();
/** @internal */
const line$1 = /*#__PURE__*/ flatAlt(hardLine$1, /*#__PURE__*/ char$2(" "));
/** @internal */
const lineBreak = /*#__PURE__*/ flatAlt(hardLine$1, empty$5);
/** @internal */
const space$2 = /*#__PURE__*/ char$2(" ");
/** @internal */
const cats$1 = (docs) => group(vcat(docs));
/** @internal */
const catWithLine = /*#__PURE__*/ dual(2, (self, that) => cat$1(self, cat$1(line$1, that)));
/** @internal */
const catWithLineBreak = /*#__PURE__*/ dual(2, (self, that) => cat$1(self, cat$1(lineBreak, that)));
/** @internal */
const catWithSpace = /*#__PURE__*/ dual(2, (self, that) => cat$1(self, cat$1(space$2, that)));
/** @internal */
const concatWith = /*#__PURE__*/ dual(2, (docs, f) => Arr.matchRight(Arr.fromIterable(docs), {
	onEmpty: () => empty$5,
	onNonEmpty: (init, last) => Arr.reduceRight(init, last, (curr, acc) => f(acc, curr))
}));
/** @internal */
const vcat = (docs) => concatWith(docs, (left, right) => catWithLineBreak(left, right));
/** @internal */
const hsep$1 = (docs) => concatWith(docs, (left, right) => catWithSpace(left, right));
/** @internal */
const vsep$1 = (docs) => concatWith(docs, (left, right) => catWithLine(left, right));
/** @internal */
const group = (self) => {
	switch (self._tag) {
		case "FlatAlt": {
			const flattened = changesUponFlattening(self.right);
			switch (flattened._tag) {
				case "Flattened": return union(flattened.value, self.left);
				case "AlreadyFlat": return union(self.right, self.left);
				case "NeverFlat": return self.left;
			}
		}
		case "Union": return self;
		default: {
			const flattened = changesUponFlattening(self);
			return isFlattened(flattened) ? union(flattened.value, self) : self;
		}
	}
};
/** @internal */
const column = (react) => {
	const op = Object.create(proto$9);
	op._tag = "Column";
	op.react = react;
	return op;
};
/** @internal */
const nesting = (react) => {
	const op = Object.create(proto$9);
	op._tag = "Nesting";
	op.react = react;
	return op;
};
/** @internal */
const pageWidth = (react) => {
	const op = Object.create(proto$9);
	op._tag = "WithPageWidth";
	op.react = react;
	return op;
};
/** @internal */
const nest$1 = /*#__PURE__*/ dual(2, (self, indent) => indent === 0 ? self : (() => {
	const op = Object.create(proto$9);
	op._tag = "Nest";
	op.indent = indent;
	op.doc = self;
	return op;
})());
/** @internal */
const align$1 = (self) => column((position) => nesting((level) => nest$1(self, position - level)));
/** @internal */
const hang = /*#__PURE__*/ dual(2, (self, indent) => align$1(nest$1(self, indent)));
/** @internal */
const indent$1 = /*#__PURE__*/ dual(2, (self, indent) => hang(cat$1(spaces(indent), self), indent));
/** @internal */
const flatten$2 = (self) => Effect$1.runSync(flattenSafe(self));
const flattenSafe = (self) => Effect$1.gen(function* () {
	switch (self._tag) {
		case "Fail": return self;
		case "Empty": return self;
		case "Char": return self;
		case "Text": return self;
		case "Line": return fail;
		case "FlatAlt": return yield* flattenSafe(self.right);
		case "Cat": {
			const left = yield* flattenSafe(self.left);
			const right = yield* flattenSafe(self.right);
			return cat$1(left, right);
		}
		case "Nest": {
			const doc = yield* flattenSafe(self.doc);
			return nest$1(doc, self.indent);
		}
		case "Union": return yield* flattenSafe(self.left);
		case "Column": return column((position) => flatten$2(self.react(position)));
		case "WithPageWidth": return pageWidth((pageWidth) => flatten$2(self.react(pageWidth)));
		case "Nesting": return nesting((level) => flatten$2(self.react(level)));
		case "Annotated": {
			const doc = yield* flattenSafe(self.doc);
			return annotate$1(doc, self.annotation);
		}
	}
});
/** @internal */
const changesUponFlattening = (self) => Effect$1.runSync(changesUponFlatteningSafe(self));
const changesUponFlatteningSafe = (self) => Effect$1.gen(function* () {
	switch (self._tag) {
		case "Fail":
		case "Line": return neverFlat;
		case "Empty":
		case "Char":
		case "Text": return alreadyFlat;
		case "FlatAlt": {
			const doc = yield* flattenSafe(self.right);
			return flattened(doc);
		}
		case "Cat": {
			const left = yield* changesUponFlatteningSafe(self.left);
			const right = yield* changesUponFlatteningSafe(self.right);
			if (isNeverFlat(left) || isNeverFlat(right)) return neverFlat;
			if (isFlattened(left) && isFlattened(right)) return flattened(cat$1(left.value, right.value));
			if (isFlattened(left) && isAlreadyFlat(right)) return flattened(cat$1(left.value, self.right));
			if (isAlreadyFlat(left) && isFlattened(right)) return flattened(cat$1(self.left, right.value));
			if (isAlreadyFlat(left) && isAlreadyFlat(right)) return alreadyFlat;
			throw new Error("[BUG]: Doc.changesUponFlattening - unable to flatten a Cat document - please open an issue at https://github.com/IMax153/contentlayer/issues/new");
		}
		case "Nest": return yield* pipe(changesUponFlatteningSafe(self.doc), Effect$1.map(map$4((doc) => nest$1(doc, self.indent))));
		case "Union": return flattened(self.left);
		case "Column": {
			const doc = column((position) => Effect$1.runSync(flattenSafe(self.react(position))));
			return flattened(doc);
		}
		case "WithPageWidth": {
			const doc = pageWidth((pageWidth) => Effect$1.runSync(flattenSafe(self.react(pageWidth))));
			return flattened(doc);
		}
		case "Nesting": {
			const doc = nesting((level) => Effect$1.runSync(flattenSafe(self.react(level))));
			return flattened(doc);
		}
		case "Annotated": return yield* pipe(changesUponFlatteningSafe(self.doc), Effect$1.map(map$4((doc) => annotate$1(doc, self.annotation))));
	}
});
/** @internal */
const annotate$1 = /*#__PURE__*/ dual(2, (self, annotation) => {
	const op = Object.create(proto$9);
	op._tag = "Annotated";
	op.doc = self;
	op.annotation = annotation;
	return op;
});
/** @internal */
const spaces = (n) => {
	if (n <= 0) return empty$5;
	if (n === 1) return char$2(" ");
	return text$9(textSpaces(n));
};
/** @internal */
const textSpaces = (n) => {
	let s = "";
	for (let i = 0; i < n; i++) s = s += " ";
	return s;
};
//#endregion
//#region ../../node_modules/.bun/@effect+printer@0.51.0+4e526cd47ba32532/node_modules/@effect/printer/dist/esm/internal/docStream.js
const DocStreamSymbolKey = "@effect/printer/DocStream";
/** @internal */
const DocStreamTypeId = /*#__PURE__*/ Symbol.for(DocStreamSymbolKey);
const protoHash$1 = {
	FailedStream: (_) => pipe(Hash.string("@effect/printer/DocStream/FailedStream"), Hash.combine(Hash.string(DocStreamSymbolKey))),
	EmptyStream: (_) => pipe(Hash.string("@effect/printer/DocStream/EmptyStream"), Hash.combine(Hash.string(DocStreamSymbolKey))),
	CharStream: (self) => pipe(Hash.hash("@effect/printer/DocStream/CharStream"), Hash.combine(Hash.string(DocStreamSymbolKey)), Hash.combine(Hash.string(self.char)), Hash.combine(Hash.hash(self.stream))),
	TextStream: (self) => pipe(Hash.string("@effect/printer/DocStream/TextStream"), Hash.combine(Hash.string(DocStreamSymbolKey)), Hash.combine(Hash.string(self.text)), Hash.combine(Hash.hash(self.stream))),
	LineStream: (self) => pipe(Hash.string("@effect/printer/DocStream/LineStream"), Hash.combine(Hash.string(DocStreamSymbolKey)), Hash.combine(Hash.hash(self.stream))),
	PushAnnotationStream: (self) => pipe(Hash.string("@effect/printer/DocStream/PopAnnotationStream"), Hash.combine(Hash.string(DocStreamSymbolKey)), Hash.combine(Hash.hash(self.annotation)), Hash.combine(Hash.hash(self.stream))),
	PopAnnotationStream: (self) => pipe(Hash.string("@effect/printer/DocStream/PopAnnotationStream"), Hash.combine(Hash.string(DocStreamSymbolKey)), Hash.combine(Hash.hash(self.stream)))
};
const protoEqual$1 = {
	FailedStream: (self, that) => isDocStream(that) && that._tag === "FailedStream",
	EmptyStream: (self, that) => isDocStream(that) && that._tag === "EmptyStream",
	CharStream: (self, that) => isDocStream(that) && that._tag === "CharStream" && self.char === that.char && Equal.equals(self.stream, that.stream),
	TextStream: (self, that) => isDocStream(that) && that._tag === "TextStream" && self.text === that.text && Equal.equals(self.stream, that.stream),
	LineStream: (self, that) => isDocStream(that) && that._tag === "LineStream" && Equal.equals(self.stream, that.stream),
	PushAnnotationStream: (self, that) => isDocStream(that) && that._tag === "PushAnnotationStream" && Equal.equals(self.annotation, that.annotation) && Equal.equals(self.stream, that.stream),
	PopAnnotationStream: (self, that) => isDocStream(that) && that._tag === "PopAnnotationStream" && Equal.equals(self.stream, that.stream)
};
const proto$8 = {
	[DocStreamTypeId]: { _A: (_) => _ },
	[Hash.symbol]() {
		return Hash.cached(this, protoHash$1[this._tag](this));
	},
	[Equal.symbol](that) {
		return protoEqual$1[this._tag](this, that);
	}
};
/** @internal */
const isDocStream = (u) => typeof u === "object" && u != null && DocStreamTypeId in u;
/** @internal */
const isEmptyStream = (self) => self._tag === "EmptyStream";
/** @internal */
const isLineStream = (self) => self._tag === "LineStream";
/** @internal */
const failed = /*#__PURE__*/ (() => {
	const op = /*#__PURE__*/ Object.create(proto$8);
	op._tag = "FailedStream";
	return op;
})();
/** @internal */
const empty$4 = /*#__PURE__*/ (() => {
	const op = /*#__PURE__*/ Object.create(proto$8);
	op._tag = "EmptyStream";
	return op;
})();
/** @internal */
const char$1 = /*#__PURE__*/ dual(2, (self, char) => {
	const op = Object.create(proto$8);
	op._tag = "CharStream";
	op.char = char;
	op.stream = self;
	return op;
});
/** @internal */
const text$8 = /*#__PURE__*/ dual(2, (self, text) => {
	const op = Object.create(proto$8);
	op._tag = "TextStream";
	op.text = text;
	op.stream = self;
	return op;
});
/** @internal */
const line = /*#__PURE__*/ dual(2, (self, indentation) => {
	const op = Object.create(proto$8);
	op._tag = "LineStream";
	op.indentation = indentation;
	op.stream = self;
	return op;
});
/** @internal */
const pushAnnotation = /*#__PURE__*/ dual(2, (self, annotation) => {
	const op = Object.create(proto$8);
	op._tag = "PushAnnotationStream";
	op.annotation = annotation;
	op.stream = self;
	return op;
});
/** @internal */
const popAnnotation = (stream) => {
	const op = Object.create(proto$8);
	op._tag = "PopAnnotationStream";
	op.stream = stream;
	return op;
};
//#endregion
//#region ../../node_modules/.bun/@effect+printer@0.51.0+4e526cd47ba32532/node_modules/@effect/printer/dist/esm/internal/layoutPipeline.js
/** @internal */
const nil = { _tag: "Nil" };
/** @internal */
const cons = (indent, document, pipeline) => ({
	_tag: "Cons",
	indent,
	document,
	pipeline
});
/** @internal */
const undoAnnotation = (pipeline) => ({
	_tag: "UndoAnnotation",
	pipeline
});
//#endregion
//#region ../../node_modules/.bun/@effect+printer@0.51.0+4e526cd47ba32532/node_modules/@effect/printer/dist/esm/internal/pageWidth.js
const PageWidthSymbolKey = "@effect/printer/PageWidth";
/** @internal */
const PageWidthTypeId = /*#__PURE__*/ Symbol.for(PageWidthSymbolKey);
const protoHash = {
	AvailablePerLine: (self) => pipe(Hash.hash("@effect/printer/PageWidth/AvailablePerLine"), Hash.combine(Hash.hash(PageWidthSymbolKey)), Hash.combine(Hash.hash(self.lineWidth)), Hash.combine(Hash.hash(self.ribbonFraction))),
	Unbounded: (_) => pipe(Hash.hash("@effect/printer/PageWidth/Unbounded"), Hash.combine(Hash.hash(PageWidthSymbolKey)))
};
const protoEqual = {
	AvailablePerLine: (self, that) => isPageWidth(that) && that._tag === "AvailablePerLine" && self.lineWidth === that.lineWidth && self.ribbonFraction === that.ribbonFraction,
	Unbounded: (self, that) => isPageWidth(that) && that._tag === "Unbounded"
};
const proto$7 = {
	[PageWidthTypeId]: PageWidthTypeId,
	[Hash.symbol]() {
		return Hash.cached(this, protoHash[this._tag](this));
	},
	[Equal.symbol](that) {
		return protoEqual[this._tag](this, that);
	}
};
/** @internal */
const isPageWidth = (u) => typeof u === "object" && u != null && PageWidthTypeId in u;
/** @internal */
const availablePerLine = (lineWidth, ribbonFraction) => {
	const op = Object.create(proto$7);
	op._tag = "AvailablePerLine";
	op.lineWidth = lineWidth;
	op.ribbonFraction = ribbonFraction;
	return op;
};
/** @internal */
const unbounded$1 = /*#__PURE__*/ (() => {
	const op = /*#__PURE__*/ Object.create(proto$7);
	op._tag = "Unbounded";
	return op;
})();
/** @internal */
const defaultPageWidth$1 = /*#__PURE__*/ availablePerLine(80, 1);
/** @internal */
const remainingWidth = (pageWidth, ribbonFraction, indentation, currentColumn) => {
	const columnsLeftInLine = pageWidth - currentColumn;
	const columnsLeftInRibbon = indentation + Math.max(0, Math.min(pageWidth, Math.floor(pageWidth * ribbonFraction))) - currentColumn;
	return Math.min(columnsLeftInLine, columnsLeftInRibbon);
};
//#endregion
//#region ../../node_modules/.bun/@effect+printer@0.51.0+4e526cd47ba32532/node_modules/@effect/printer/dist/esm/internal/layout.js
/** @internal */
const options$1 = (pageWidth) => ({ pageWidth });
/** @internal */
const wadlerLeijen = /*#__PURE__*/ dual(3, (self, fits, options) => Effect$1.runSync(wadlerLeijenSafe(cons(0, self, nil), 0, 0, fits, options)));
const wadlerLeijenSafe = (self, nestingLevel, currentColumn, fits, options) => {
	const best = (self, nl, cc) => Effect$1.gen(function* () {
		switch (self._tag) {
			case "Nil": return empty$4;
			case "Cons": switch (self.document._tag) {
				case "Fail": return failed;
				case "Empty": return yield* best(self.pipeline, nl, cc);
				case "Char": {
					const stream = yield* best(self.pipeline, nl, cc + 1);
					return char$1(stream, self.document.char);
				}
				case "Text": {
					const length = self.document.text.length;
					const stream = yield* best(self.pipeline, nl, cc + length);
					return text$8(stream, self.document.text);
				}
				case "Line": {
					const stream = yield* best(self.pipeline, self.indent, self.indent);
					const nextIndent = isEmptyStream(stream) || isLineStream(stream) ? 0 : self.indent;
					return line(stream, nextIndent);
				}
				case "FlatAlt": {
					const next = cons(self.indent, self.document.left, self.pipeline);
					return yield* best(next, nl, cc);
				}
				case "Cat": {
					const inner = cons(self.indent, self.document.right, self.pipeline);
					const outer = cons(self.indent, self.document.left, inner);
					return yield* best(outer, nl, cc);
				}
				case "Nest": {
					const indent = self.indent + self.document.indent;
					const next = cons(indent, self.document.doc, self.pipeline);
					return yield* best(next, nl, cc);
				}
				case "Union": {
					const leftPipeline = cons(self.indent, self.document.left, self.pipeline);
					const rightPipeline = cons(self.indent, self.document.right, self.pipeline);
					const left = best(leftPipeline, nl, cc);
					const right = best(rightPipeline, nl, cc);
					return selectNicer(fits, nl, cc, left, right);
				}
				case "Column": {
					const doc = self.document.react(cc);
					const next = cons(self.indent, doc, self.pipeline);
					return yield* best(next, nl, cc);
				}
				case "WithPageWidth": {
					const doc = self.document.react(options.pageWidth);
					const next = cons(self.indent, doc, self.pipeline);
					return yield* best(next, nl, cc);
				}
				case "Nesting": {
					const doc = self.document.react(self.indent);
					const next = cons(self.indent, doc, self.pipeline);
					return yield* best(next, nl, cc);
				}
				case "Annotated": {
					const undo = undoAnnotation(self.pipeline);
					const next = cons(self.indent, self.document.doc, undo);
					const stream = yield* best(next, nl, cc);
					return pushAnnotation(stream, self.document.annotation);
				}
			}
			case "UndoAnnotation": {
				const stream = yield* best(self.pipeline, nestingLevel, currentColumn);
				return popAnnotation(stream);
			}
		}
	});
	return best(self, nestingLevel, currentColumn);
};
const selectNicer = (fits, lineIndent, currentColumn, left, right) => {
	const leftStream = Effect$1.runSync(left);
	let rightStream = void 0;
	return fits(leftStream, lineIndent, currentColumn, () => rightStream ?? (rightStream = Effect$1.runSync(right), rightStream)) ? leftStream : rightStream ?? Effect$1.runSync(right);
};
/** @internal */
const compact$1 = (self) => Effect$1.runSync(compactSafe(List.of(self), 0));
const compactSafe = (docs, i) => Effect$1.gen(function* () {
	if (List.isNil(docs)) return empty$4;
	const head = docs.head;
	const tail = docs.tail;
	switch (head._tag) {
		case "Fail": return failed;
		case "Empty": return yield* compactSafe(tail, i);
		case "Char": {
			const stream = yield* compactSafe(tail, i + 1);
			return char$1(stream, head.char);
		}
		case "Text": {
			const stream = yield* compactSafe(tail, i + head.text.length);
			return text$8(stream, head.text);
		}
		case "Line": {
			const stream = yield* compactSafe(tail, 0);
			return line(stream, 0);
		}
		case "FlatAlt": return yield* compactSafe(List.cons(head.left, tail), i);
		case "Cat": {
			const list = List.cons(head.left, List.cons(head.right, tail));
			return yield* compactSafe(list, i);
		}
		case "Nest": return yield* compactSafe(List.cons(head.doc, tail), i);
		case "Union": return yield* compactSafe(List.cons(head.right, tail), i);
		case "Column": return yield* compactSafe(List.cons(head.react(i), tail), i);
		case "WithPageWidth": return yield* compactSafe(List.cons(head.react(unbounded$1), tail), i);
		case "Nesting": return yield* compactSafe(List.cons(head.react(0), tail), i);
		case "Annotated": return yield* compactSafe(List.cons(head.doc, tail), i);
	}
});
/** @internal */
const pretty$1 = /*#__PURE__*/ dual(2, (self, options) => {
	const width = options.pageWidth;
	if (width._tag === "AvailablePerLine") return wadlerLeijen(self, (stream, indentation, currentColumn) => {
		const remainingWidth$2 = remainingWidth(width.lineWidth, width.ribbonFraction, indentation, currentColumn);
		return fitsPretty(stream, remainingWidth$2);
	}, options);
	return unbounded(self);
});
const fitsPretty = (self, width) => {
	let w = width;
	let stream = self;
	while (w >= 0) switch (stream._tag) {
		case "FailedStream": return false;
		case "EmptyStream": return true;
		case "CharStream":
			w = w - 1;
			stream = stream.stream;
			break;
		case "TextStream":
			w = w - stream.text.length;
			stream = stream.stream;
			break;
		case "LineStream": return true;
		case "PushAnnotationStream":
			stream = stream.stream;
			break;
		case "PopAnnotationStream": stream = stream.stream;
	}
	return false;
};
/** @internal */
const smart$1 = /*#__PURE__*/ dual(2, (self, options) => {
	const width = options.pageWidth;
	if (width._tag === "AvailablePerLine") return wadlerLeijen(self, fitsSmart(width.lineWidth, width.ribbonFraction), options);
	return unbounded(self);
});
const fitsSmart = (pageWidth, ribbonFraction) => {
	return (stream, indentation, currentColumn, comparator) => {
		const availableWidth = remainingWidth(pageWidth, ribbonFraction, indentation, currentColumn);
		return fitsSmartLoop(stream, comparator, pageWidth, currentColumn, availableWidth);
	};
};
const fitsSmartLoop = (self, comparator, pageWidth, currentColumn, availableWidth) => {
	let minNestingLevel;
	let stream = self;
	let w = availableWidth;
	while (w >= 0) switch (stream._tag) {
		case "FailedStream": return false;
		case "EmptyStream": return true;
		case "CharStream":
			w = w - 1;
			stream = stream.stream;
			break;
		case "TextStream":
			w = w - stream.text.length;
			stream = stream.stream;
			break;
		case "LineStream":
			if (!minNestingLevel) minNestingLevel = Option$1.match(getInitialIndentation(comparator()), {
				onNone: () => currentColumn,
				onSome: (value) => Math.min(value, currentColumn)
			});
			if (minNestingLevel < stream.indentation) return false;
			w = pageWidth - stream.indentation;
			stream = stream.stream;
			break;
		case "PushAnnotationStream":
			stream = stream.stream;
			break;
		case "PopAnnotationStream": stream = stream.stream;
	}
	return false;
};
const getInitialIndentation = (self) => {
	let stream = self;
	while (stream._tag === "LineStream" || stream._tag === "PushAnnotationStream" || stream._tag === "PopAnnotationStream") {
		if (stream._tag === "LineStream") return Option$1.some(stream.indentation);
		stream = stream.stream;
	}
	return Option$1.none();
};
/** @internal */
const unbounded = (self) => wadlerLeijen(self, (stream) => !failsOnFirstLine(stream), { pageWidth: unbounded$1 });
const failsOnFirstLine = (self) => {
	let stream = self;
	while (1) switch (stream._tag) {
		case "FailedStream": return true;
		case "EmptyStream": return false;
		case "CharStream":
			stream = stream.stream;
			break;
		case "TextStream":
			stream = stream.stream;
			break;
		case "LineStream": return false;
		case "PushAnnotationStream":
			stream = stream.stream;
			break;
		case "PopAnnotationStream": stream = stream.stream;
	}
	throw new Error("bug");
};
//#endregion
//#region ../../node_modules/.bun/@effect+printer@0.51.0+4e526cd47ba32532/node_modules/@effect/printer/dist/esm/Doc.js
/**
* The abstract data type `Doc<A>` represents prettified documents that have
* been annotated with data of type `A`.
*
* More specifically, a value of type `Doc` represents a non-empty set of
* possible layouts for a given document. The layout algorithms select one of
* these possibilities, taking into account variables such as the width of the
* document.
*
* The annotation is an arbitrary piece of data associated with (part of) a
* document. Annotations may be used by rendering algorithms to display
* documents differently by providing information such as:
* - color information (e.g., when rendering to the terminal)
* - mouseover text (e.g., when rendering to rich HTML)
* - whether to show something or not (to allow simple or detailed versions)
*
* @since 1.0.0
*/
/**
* A document containing a single character.
*
* **Invariants**
* - Cannot be the newline (`"\n"`) character
*
* Control characters are preserved verbatim. Apply `sanitize` before rendering
* a document containing untrusted text to a terminal.
*
* @since 1.0.0
* @category constructors
*/
const char = char$2;
/**
* A document containing a string of text.
*
* **Invariants**
* - Text cannot be less than two characters long
* - Text cannot contain a newline (`"\n"`) character
*
* Control characters are preserved verbatim. Apply `sanitize` before rendering
* a document containing untrusted text to a terminal.
*
* @since 1.0.0
* @category constructors
*/
const text$7 = text$9;
/**
* The `empty` document behaves like a document containing the empty string
* (`""`), so it has a height of `1`.
*
* This may lead to surprising behavior if the empty document is expected to
* bear no weight inside certain layout functions, such as`vcat`, where it will
* render an empty line of output.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import * as Doc from "@effect/printer/Doc"
* import * as String from "effect/String"
*
* const doc = Doc.vsep([
*   Doc.text("hello"),
*   // `parentheses` for visibility purposes only
*   Doc.parenthesized(Doc.empty),
*   Doc.text("world")
* ])
*
* const expected = `|hello
*                   |()
*                   |world`
*
* assert.strictEqual(
*   Doc.render(doc, { style: "pretty" }),
*   String.stripMargin(expected)
* )
* ```
*
* @since 1.0.0
* @category primitives
*/
const empty$3 = empty$5;
/**
* The `hardLine` document is always laid out as a line break, regardless of
* space or whether or not the document was `group`"ed.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import * as Doc from "@effect/printer/Doc"
* import * as String from "effect/String"
*
* const doc: Doc.Doc<never> = Doc.hcat([
*   Doc.text("lorem ipsum"),
*   Doc.hardLine,
*   Doc.text("dolor sit amet")
* ])
*
* // Even with enough space, a line break is introduced
* assert.strictEqual(
*   Doc.render(doc, {
*     style: "pretty",
*     options: { lineWidth: 1000 }
*   }),
*   String.stripMargin(
*     `|lorem ipsum
*      |dolor sit amet`
*   )
* )
* ```
*
* @since 1.0.0
* @category primitives
*/
const hardLine = hardLine$1;
/**
* A document containing a single ` ` character.
*
* @since 1.0.0
* @category primitives
*/
const space$1 = space$2;
/**
* The `cat` combinator lays out two documents separated by nothing.
*
* @since 1.0.0
* @category concatenation
*/
const cat = cat$1;
/**
* The `cats` combinator will attempt to lay out a collection of documents
* separated by nothing. If the output does not fit the page, then the documents
* will be separated by newlines. This is what differentiates it from `vcat`,
* which always lays out documents beneath one another.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import * as Doc from "@effect/printer/Doc"
* import * as String from "effect/String"
*
* const doc: Doc.Doc<never> = Doc.hsep([
*   Doc.text("Docs:"),
*   Doc.cats(Doc.words("lorem ipsum dolor"))
* ])
*
* assert.strictEqual(
*   Doc.render(doc, { style: "pretty" }),
*   "Docs: loremipsumdolor"
* )
*
* // If the document exceeds the width of the page, the documents are rendered
* // one above another
* assert.strictEqual(
*   Doc.render(doc, {
*     style: "pretty",
*     options: { lineWidth: 10 }
*   }),
*   String.stripMargin(
*     `|Docs: lorem
*      |ipsum
*      |dolor`
*   )
* )
* ```
*
* @since 1.0.0
* @category concatenation
*/
const cats = cats$1;
/**
* The `hsep` combinator concatenates all documents in a collection horizontally
* by placing a `space` between each pair of documents.
*
* For automatic line breaks, consider using `fillSep`.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import * as Doc from "@effect/printer/Doc"
*
* const doc: Doc.Doc<never> = Doc.hsep(Doc.words("lorem ipsum dolor sit amet"))
*
* assert.strictEqual(
*   Doc.render(doc, {
*     style: "pretty",
*     options: { lineWidth: 80 }
*   }),
*   "lorem ipsum dolor sit amet"
* )
*
* // The `hsep` combinator will not introduce line breaks on its own, even when
* // the page is too narrow
* assert.strictEqual(
*   Doc.render(doc, {
*     style: "pretty",
*     options: { lineWidth: 5 }
*   }),
*   "lorem ipsum dolor sit amet"
* )
* ```
*
* @since 1.0.0
* @category separation
*/
const hsep = hsep$1;
/**
* The `vsep` combinator concatenates all documents in a collection vertically.
* If a `group` undoes the line breaks inserted by `vsep`, the documents are
* separated with a space instead.
*
* When a `vsep` is `group`ed, the documents are separated with a `space` if the
* layoutfits the page, otherwise nothing is done. See the `sep` convenience
* function for this use case.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import * as Doc from "@effect/printer/Doc"
* import * as String from "effect/String"
*
* const unaligned = Doc.hsep([
*   Doc.text("prefix"),
*   Doc.vsep(Doc.words("text to lay out"))
* ])
*
* assert.strictEqual(
*   Doc.render(unaligned, { style: "pretty" }),
*   String.stripMargin(
*     `|prefix text
*      |to
*      |lay
*      |out`
*   )
* )
*
* // The `align` function can be used to align the documents under their first
* // element
* const aligned = Doc.hsep([
*   Doc.text("prefix"),
*   Doc.align(Doc.vsep(Doc.words("text to lay out")))
* ])
*
* assert.strictEqual(
*   Doc.render(aligned, { style: "pretty" }),
*   String.stripMargin(
*     `|prefix text
*      |       to
*      |       lay
*      |       out`
*   )
* )
* ```
*
* @since 1.0.0
* @category separation
*/
const vsep = vsep$1;
/**
* Lays out a document with the current nesting level (indentation
* of the following lines) increased by the specified `indent`.
* Negative values are allowed and will decrease the nesting level
* accordingly.
*
* See also:
* * `hang`: nest a document relative to the current cursor
* position instead of the current nesting level
* * `align`: set the nesting level to the current cursor
* position
* * `indent`: increase the indentation on the spot, padding
* any empty space with spaces
*
* @example
* ```ts
* import * as assert from "node:assert"
* import * as Doc from "@effect/printer/Doc"
* import { pipe } from "effect/Function"
* import * as String from "effect/String"
*
* const doc = Doc.vsep([
*   pipe(Doc.vsep(Doc.words("lorem ipsum dolor")), Doc.nest(4)),
*   Doc.text("sit"),
*   Doc.text("amet")
* ])
*
* assert.strictEqual(
*   Doc.render(doc, { style: "pretty" }),
*   String.stripMargin(
*     `|lorem
*      |    ipsum
*      |    dolor
*      |sit
*      |amet`
*   )
* )
* ```
*
* @since 1.0.0
* @category alignment
*/
const nest = nest$1;
/**
* The `align` combinator lays out a document with the nesting level set to the
* current column.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import * as Doc from "@effect/printer/Doc"
* import * as String from "effect/String"
*
* // As an example, the documents below will be placed one above the other
* // regardless of the current nesting level
*
* // Without `align`ment, the second line is simply placed below everything
* // that has been laid out so far
* const unaligned = Doc.hsep([
*   Doc.text("lorem"),
*   Doc.vsep([Doc.text("ipsum"), Doc.text("dolor")])
* ])
*
* assert.strictEqual(
*   Doc.render(unaligned, { style: "pretty" }),
*   String.stripMargin(
*     `|lorem ipsum
*      |dolor`
*   )
* )
*
* // With `align`ment, the `vsep`ed documents all start at the same column
* const aligned = Doc.hsep([
*   Doc.text("lorem"),
*   Doc.align(Doc.vsep([Doc.text("ipsum"), Doc.text("dolor")]))
* ])
*
* assert.strictEqual(
*   Doc.render(aligned, { style: "pretty" }),
*   String.stripMargin(
*     `|lorem ipsum
*      |      dolor`
*   )
* )
* ```
*
* @since 1.0.0
* @category alignment
*/
const align = align$1;
/**
* The `indent` combinator indents a document by the specified `indent`
* beginning from the current cursor position.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import * as Doc from "@effect/printer/Doc"
* import { pipe } from "effect/Function"
* import * as String from "effect/String"
*
* const doc = Doc.hcat([
*   Doc.text("prefix"),
*   pipe(Doc.reflow("The indent function indents these words!"), Doc.indent(4))
* ])
*
* assert.strictEqual(
*   Doc.render(doc, {
*     style: "pretty",
*     options: { lineWidth: 24 }
*   }),
*   String.stripMargin(
*     `|prefix    The indent
*      |          function
*      |          indents these
*      |          words!`
*   )
* )
* ```
*
* @since 1.0.0
* @category alignment
*/
const indent = indent$1;
/**
* Adds an annotation to a `Doc`. The annotation can then be used by the rendering
* algorithm to, for example, add color to certain parts of the output.
*
* **Note** This function is relevant only for custom formats with their own annotations,
* and is not relevant for basic pretty printing.
*
* @since 1.0.0
* @category annotations
*/
const annotate = annotate$1;
//#endregion
//#region ../../node_modules/.bun/@effect+printer-ansi@0.51.0+4e526cd47ba32532/node_modules/@effect/printer-ansi/dist/esm/internal/ansiDoc.js
/** @internal */
const beep$1 = /*#__PURE__*/ annotate(empty$3, beep$2);
/** @internal */
const cursorTo$1 = (column, row) => annotate(empty$3, cursorTo$2(column, row));
/** @internal */
const cursorMove$1 = (column, row) => annotate(empty$3, cursorMove$2(column, row));
/** @internal */
const cursorDown$1 = (lines = 1) => annotate(empty$3, cursorDown$2(lines));
/** @internal */
const cursorLeft$1 = /*#__PURE__*/ annotate(empty$3, cursorLeft$2);
/** @internal */
const cursorSavePosition$1 = /*#__PURE__*/ annotate(empty$3, cursorSavePosition$2);
/** @internal */
const cursorRestorePosition$1 = /*#__PURE__*/ annotate(empty$3, cursorRestorePosition$2);
/** @internal */
const cursorHide$1 = /*#__PURE__*/ annotate(empty$3, cursorHide$2);
/** @internal */
const cursorShow$1 = /*#__PURE__*/ annotate(empty$3, cursorShow$2);
/** @internal */
const eraseLines$1 = (rows) => annotate(empty$3, eraseLines$2(rows));
/** @internal */
const eraseLine$1 = /*#__PURE__*/ annotate(empty$3, eraseLine$2);
//#endregion
//#region ../../node_modules/.bun/@effect+printer@0.51.0+4e526cd47ba32532/node_modules/@effect/printer/dist/esm/PageWidth.js
/**
* @since 1.0.0
*/
/**
* @since 1.0.0
* @category constructors
*/
const defaultPageWidth = defaultPageWidth$1;
//#endregion
//#region ../../node_modules/.bun/@effect+printer@0.51.0+4e526cd47ba32532/node_modules/@effect/printer/dist/esm/Layout.js
/**
* @since 1.0.0
*/
/**
* @since 1.0.0
* @category constructors
*/
const options = options$1;
/**
* A layout algorithm which will lay out a document without adding any
* indentation and without preserving annotations.
*
* Since no pretty-printing is involved, this layout algorithm is very fast. The
* resulting output contains fewer characters than a pretty-printed version and
* can be used for output that is read by other programs.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import * as Doc from "@effect/printer/Doc"
* import { pipe } from "effect/Function"
* import * as String from "effect/String"
*
* const doc = pipe(
*   Doc.vsep([
*     Doc.text("lorem"),
*     Doc.text("ipsum"),
*     pipe(
*       Doc.vsep([Doc.text("dolor"), Doc.text("sit")]),
*       Doc.hang(4)
*     )
*   ]),
*   Doc.hang(4)
* )
*
* assert.strictEqual(
*   Doc.render(doc, { style: "pretty" }),
*   String.stripMargin(
*     `|lorem
*      |    ipsum
*      |    dolor
*      |        sit`
*   )
* )
*
* assert.strictEqual(
*   Doc.render(doc, { style: "compact" }),
*   String.stripMargin(
*     `|lorem
*      |ipsum
*      |dolor
*      |sit`
*   )
* )
* ```
*
* @since 1.0.0
* @category layout algorithms
*/
const compact = compact$1;
/**
* The `pretty` layout algorithm is the default algorithm for rendering
* documents.
*
* `pretty` commits to rendering something in a certain way if the next
* element fits the layout constrants. In other words, it has one `DocStream`
* element lookahead when rendering.
*
* Consider using the smarter, but slightly less performant `smart`
* algorithm if the results seem to run off to the right before having lots of
* line breaks.
*
* @since 1.0.0
* @category layout algorithms
*/
const pretty = pretty$1;
/**
* A layout algorithm with more look ahead than `pretty`, which will introduce
* line breaks into a document earlier if the content does not, or will not, fit
* onto one line.
*
* @example
* ```ts
* import * as assert from "node:assert"
* import * as Doc from "@effect/printer/Doc"
* import type * as DocStream from "@effect/printer/DocStream"
* import * as Layout from "@effect/printer/Layout"
* import * as PageWidth from "@effect/printer/PageWidth"
* import { pipe } from "effect/Function"
* import * as String from "effect/String"
*
* // Consider the following python-ish document:
* const fun = <A>(doc: Doc.Doc<A>): Doc.Doc<A> =>
*   Doc.hcat([
*     pipe(
*       Doc.hcat([Doc.text("fun("), Doc.softLineBreak, doc]),
*       Doc.hang(2)
*     ),
*     Doc.text(")")
*   ])
*
* const funs = <A>(doc: Doc.Doc<A>): Doc.Doc<A> =>
*   pipe(doc, fun, fun, fun, fun, fun)
*
* const doc = funs(Doc.align(Doc.list(Doc.words("abcdef ghijklm"))))
*
* // The document will be rendered using the following pipeline, where the choice
* // of layout algorithm has been left open:
* const pageWidth = PageWidth.availablePerLine(26, 1)
* const layoutOptions = Layout.options(pageWidth)
* const dashes = Doc.text(Array.from({ length: 26 - 2 }, () => "-").join(""))
* const hr = Doc.hcat([Doc.vbar, dashes, Doc.vbar])
*
* const render = <A>(
*   doc: Doc.Doc<A>
* ) =>
*   (
*     layoutAlgorithm: (options: Layout.Layout.Options) => (doc: Doc.Doc<A>) => DocStream.DocStream<A>
*   ): string => pipe(Doc.vsep([hr, doc, hr]), layoutAlgorithm(layoutOptions), Doc.renderStream)
*
* // If rendered using `Layout.pretty`, with a page width of `26` characters per line,
* // all the calls to `fun` will fit into the first line. However, this exceeds the
* // desired `26` character page width.
* assert.strictEqual(
*   render(doc)(Layout.pretty),
*   String.stripMargin(
*     `||------------------------|
*      |fun(fun(fun(fun(fun(
*      |                  [ abcdef
*      |                  , ghijklm ])))))
*      ||------------------------|`
*   )
* )
*
* // The same document, rendered with `Layout.smart`, fits the layout contstraints:
* assert.strictEqual(
*   render(doc)(Layout.smart),
*   String.stripMargin(
*     `||------------------------|
*      |fun(
*      |  fun(
*      |    fun(
*      |      fun(
*      |        fun(
*      |          [ abcdef
*      |          , ghijklm ])))))
*      ||------------------------|`
*   )
* )
*
* // The key difference between `Layout.pretty` and `Layout.smart` is that the
* // latter will check the potential document until it encounters a line with the
* // same indentation or less than the start of the document. Any line encountered
* // earlier is assumed to belong to the same syntactic structure. In contrast,
* // `Layout.pretty` checks only the first line.
*
* // Consider for example the question of whether the `A`s fit into the document
* // below:
* // > 1 A
* // > 2   A
* // > 3  A
* // > 4 B
* // > 5   B
*
* // `pretty` will check only the first line, ignoring whether the second line
* // may already be too wide. In contrast, `Layout.smart` stops only once it reaches
* // the fourth line 4, where the `B` has the same indentation as the first `A`.
* ```
*
* @since 1.0.0
* @category layout algorithms
*/
const smart = smart$1;
//#endregion
//#region ../../node_modules/.bun/@effect+printer-ansi@0.51.0+4e526cd47ba32532/node_modules/@effect/printer-ansi/dist/esm/internal/ansiRender.js
/** @internal */
const render$2 = /*#__PURE__*/ dual(2, (self, config) => {
	switch (config.style) {
		case "compact": return renderStream(compact(self));
		case "pretty": {
			const width = Object.assign({}, defaultPageWidth, config.options);
			return renderStream(pretty(self, options(width)));
		}
		case "smart": {
			const width = Object.assign({}, defaultPageWidth, config.options);
			return renderStream(smart(self, options(width)));
		}
	}
});
/** @internal */
const renderStream = (self) => Effect$1.runSync(renderSafe(self, List.of(none$2)));
const unsafePeek = (stack) => {
	if (List.isNil(stack)) throw new Error("BUG: AnsiRender.unsafePeek - peeked at an empty stack - please report an issue at https://github.com/Effect-TS/printer/issues");
	return stack.head;
};
const unsafePop = (stack) => {
	if (List.isNil(stack)) throw new Error("BUG: AnsiRender.unsafePop - popped from an empty stack - please report an issue at https://github.com/Effect-TS/printer/issues");
	return [stack.head, stack.tail];
};
const renderSafe = (self, stack) => {
	switch (self._tag) {
		case "FailedStream": return Effect$1.dieMessage("BUG: AnsiRender.renderSafe - attempted to render a failed doc stream - please report an issue at https://github.com/Effect-TS/printer/issues");
		case "EmptyStream": return Effect$1.succeed("");
		case "CharStream": return Effect$1.map(Effect$1.suspend(() => renderSafe(self.stream, stack)), (rest) => self.char + rest);
		case "TextStream": return Effect$1.map(Effect$1.suspend(() => renderSafe(self.stream, stack)), (rest) => self.text + rest);
		case "LineStream": {
			let indent = "\n";
			for (let i = 0; i < self.indentation; i++) indent = indent += " ";
			return Effect$1.map(Effect$1.suspend(() => renderSafe(self.stream, stack)), (rest) => indent + rest);
		}
		case "PushAnnotationStream": {
			const currentStyle = unsafePeek(stack);
			const nextStyle = combine$1(self.annotation, currentStyle);
			return Effect$1.map(Effect$1.suspend(() => renderSafe(self.stream, List.cons(self.annotation, stack))), (rest) => stringify(nextStyle) + rest);
		}
		case "PopAnnotationStream": {
			const [, styles] = unsafePop(stack);
			const nextStyle = unsafePeek(styles);
			return Effect$1.map(Effect$1.suspend(() => renderSafe(self.stream, styles)), (rest) => stringify(nextStyle) + rest);
		}
	}
};
//#endregion
//#region ../../node_modules/.bun/@effect+printer-ansi@0.51.0+4e526cd47ba32532/node_modules/@effect/printer-ansi/dist/esm/AnsiDoc.js
/**
* Play a beeping sound.
*
* @since 1.0.0
* @category constructors
*/
const beep = beep$1;
/**
* Moves the cursor to the specified `row` and `column`.
*
* Though the ANSI Control Sequence for Cursor Position is `1`-based, this
* method takes row and column values starting from `0` and adjusts them to `1`-
* based values.
*
* @since 1.0.0
* @category constructors
*/
const cursorTo = cursorTo$1;
/**
* Move the cursor position the specified number of `rows` and `columns`
* relative to the current cursor position.
*
* If the cursor is already at the edge of the screen in either direction, then
* additional movement will have no effect.
*
* @since 1.0.0
* @category constructors
*/
const cursorMove = cursorMove$1;
/**
* Moves the cursor down by the specified number of `lines` (default `1`)
* relative to the current cursor position.
*
* If the cursor is already at the edge of the screen, this has no effect.
*
* @since 1.0.0
* @category commands
*/
const cursorDown = cursorDown$1;
/**
* Moves the cursor to the first column of the current row.
*
* @since 1.0.0
* @category commands
*/
const cursorLeft = cursorLeft$1;
/**
* Saves the cursor position, encoding shift state and formatting attributes.
*
* @since 1.0.0
* @category commands
*/
const cursorSavePosition = cursorSavePosition$1;
/**
* Restores the cursor position, encoding shift state and formatting attributes
* from the previous save, if any, otherwise resets these all to their defaults.
*
* @since 1.0.0
* @category commands
*/
const cursorRestorePosition = cursorRestorePosition$1;
/**
* Hides the cursor.
*
* @since 1.0.0
* @category commands
*/
const cursorHide = cursorHide$1;
/**
* Shows the cursor.
*
* @since 1.0.0
* @category commands
*/
const cursorShow = cursorShow$1;
/**
* Erase from the current cursor position up the specified amount of rows.
*
* @since 1.0.0
* @category commands
*/
const eraseLines = eraseLines$1;
/**
* Clears the current line.
*
* The current cursor position does not change.
*
* @since 1.0.0
* @category commands
*/
const eraseLine = eraseLine$1;
/**
* Text leaves are rendered verbatim, including control characters. Apply
* `sanitize` to untrusted subtrees before writing the result to a terminal.
* Use the raw document when embedded terminal sequences are trusted and
* intentional.
*
* @since 1.0.0
* @category destructors
*/
const render$1 = render$2;
//#endregion
//#region ../../node_modules/.bun/@effect+printer@0.51.0+4e526cd47ba32532/node_modules/@effect/printer/dist/esm/internal/optimize.js
/** @internal */
const optimize$1 = /*#__PURE__*/ dual(2, (self, depth) => Effect$1.runSync(optimizeSafe(self, depth)));
const optimizeSafe = (self, depth) => {
	const optimize = (self) => Effect$1.gen(function* () {
		switch (self._tag) {
			case "Fail":
			case "Empty":
			case "Char":
			case "Text":
			case "Line": return self;
			case "FlatAlt": {
				const left = yield* optimize(self.left);
				const right = yield* optimize(self.right);
				return flatAlt(left, right);
			}
			case "Cat": {
				if (isEmpty$4(self.left)) return yield* optimize(self.right);
				if (isEmpty$4(self.right)) return yield* optimize(self.left);
				if (isChar(self.left) && isChar(self.right)) return text$9(self.left.char + self.right.char);
				if (isText$1(self.left) && isChar(self.right)) return text$9(self.left.text + self.right.char);
				if (isChar(self.left) && isText$1(self.right)) return text$9(self.left.char + self.right.text);
				if (isText$1(self.left) && isText$1(self.right)) return text$9(self.left.text + self.right.text);
				if (isChar(self.left) && isCat(self.right) && isChar(self.right.left) || isChar(self.left) && isCat(self.right) && isText$1(self.right.left) || isText$1(self.left) && isCat(self.right) && isChar(self.right.left) || isText$1(self.left) && isCat(self.right) && isText$1(self.right.left)) {
					const inner = yield* optimize(cat$1(self.left, self.right.left));
					return yield* optimize(cat$1(inner, self.right.right));
				}
				if (isCat(self.left) && isChar(self.left.right) || isCat(self.left) && isText$1(self.left.right)) {
					const inner = yield* optimize(cat$1(self.left.right, self.right));
					return yield* optimize(cat$1(self.left.left, inner));
				}
				const left = yield* optimize(self.left);
				const right = yield* optimize(self.right);
				return cat$1(left, right);
			}
			case "Nest":
				if (self.indent === 0) return yield* optimize(self.doc);
				if (isEmpty$4(self.doc) || isChar(self.doc) || isText$1(self.doc)) return self.doc;
				if (isNest(self.doc)) {
					const indent = self.indent + self.doc.indent;
					return yield* optimize(nest$1(self.doc.doc, indent));
				}
				return nest$1(yield* optimize(self.doc), self.indent);
			case "Union": {
				const left = yield* optimize(self.left);
				const right = yield* optimize(self.right);
				return union(left, right);
			}
			case "Column": return depth._tag === "Shallow" ? self : column((position) => Effect$1.runSync(optimizeSafe(self.react(position), depth)));
			case "WithPageWidth": return depth._tag === "Shallow" ? self : pageWidth((pageWidth) => Effect$1.runSync(optimizeSafe(self.react(pageWidth), depth)));
			case "Nesting": return depth._tag === "Shallow" ? self : nesting((level) => Effect$1.runSync(optimizeSafe(self.react(level), depth)));
			case "Annotated": return annotate$1(yield* optimize(self.doc), self.annotation);
		}
	});
	return optimize(self);
};
//#endregion
//#region ../../node_modules/.bun/@effect+printer@0.51.0+4e526cd47ba32532/node_modules/@effect/printer/dist/esm/Optimize.js
/**
* @since 1.0.0
*/
/**
* @since 1.0.0
* @category instances
*/
const Deep = { _tag: "Deep" };
/**
* The `optimize` function will combine text nodes so that they can be rendered
* more efficiently. An optimized document is always laid out in an identical
* manner to its un-optimized counterpart.
*
* When laying a `Doc` out to a `SimpleDocStream`, every component of the input
* document is translated directly to the simpler output format. This sometimes
* yields undesirable chunking when many pieces have been concatenated together.
*
* It is therefore a good idea to run `fuse` on concatenations of lots of small
* strings that are used many times.
*
* @example
* ```ts
* import * as Doc from "@effect/printer/Doc"
* import * as Optimize from "@effect/printer/Optimize"
*
* // The document below contains a chain of four entries in the output `DocStream`
* const inefficient = Doc.hsep([
*   Doc.char("a"),
*   Doc.char("b"),
*   Doc.char("c"),
*   Doc.char("d")
* ])
*
* // However, the above document is fully equivalent to the tightly packed
* // document below which is only a single entry in the output `DocStream` and
* // can be processed much more efficiently.
* const efficient = Doc.text("abcd")
*
* // We can optimize the `inefficient` document using `Optimize`
* Optimize.optimize(Optimize.Deep)(inefficient)
* ```
*
* @since 1.0.0
* @category optimization
*/
const optimize = optimize$1;
//#endregion
//#region ../../node_modules/.bun/@effect+printer-ansi@0.51.0+4e526cd47ba32532/node_modules/@effect/printer-ansi/dist/esm/Color.js
/**
* @since 1.0.0
*/
/**
* @since 1.0.0
* @category constructors
*/
const red = red$3;
/**
* @since 1.0.0
* @category constructors
*/
const magenta = magenta$1;
/**
* @since 1.0.0
* @category constructors
*/
const cyan = cyan$1;
/**
* @since 1.0.0
* @category constructors
*/
const white = white$3;
//#endregion
//#region ../../node_modules/.bun/@effect+cli@0.77.2+74e017304edf4bf0/node_modules/@effect/cli/dist/esm/internal/helpDoc/span.js
/** @internal */
const text$6 = (value) => ({
	_tag: "Text",
	value
});
/** @internal */
const empty$2 = /*#__PURE__*/ text$6("");
/** @internal */
const space = /*#__PURE__*/ text$6(" ");
/** @internal */
const code = (value) => highlight(value, white);
/** @internal */
const error = (value) => highlight(value, red);
/** @internal */
const highlight = (value, color) => ({
	_tag: "Highlight",
	value: typeof value === "string" ? text$6(value) : value,
	color
});
/** @internal */
const strong = (value) => ({
	_tag: "Strong",
	value: typeof value === "string" ? text$6(value) : value
});
/** @internal */
const weak = (value) => ({
	_tag: "Weak",
	value: typeof value === "string" ? text$6(value) : value
});
/** @internal */
const isText = (self) => self._tag === "Text";
/** @internal */
const concat$1 = /*#__PURE__*/ dual(2, (self, that) => ({
	_tag: "Sequence",
	left: self,
	right: that
}));
const getText = (self) => {
	switch (self._tag) {
		case "Text":
		case "URI": return self.value;
		case "Highlight":
		case "Weak":
		case "Strong": return getText(self.value);
		case "Sequence": return getText(self.left) + getText(self.right);
	}
};
/** @internal */
const spans = (spans) => {
	const elements = Arr.fromIterable(spans);
	if (Arr.isNonEmptyReadonlyArray(elements)) return elements.slice(1).reduce(concat$1, elements[0]);
	return empty$2;
};
/** @internal */
const isEmpty$3 = (self) => size(self) === 0;
/** @internal */
const size = (self) => {
	switch (self._tag) {
		case "Text":
		case "URI": return self.value.length;
		case "Highlight":
		case "Strong":
		case "Weak": return size(self.value);
		case "Sequence": return size(self.left) + size(self.right);
	}
};
/** @internal */
const toAnsiDoc$1 = (self) => {
	switch (self._tag) {
		case "Highlight": return annotate(toAnsiDoc$1(self.value), color(self.color));
		case "Sequence": return cat(toAnsiDoc$1(self.left), toAnsiDoc$1(self.right));
		case "Strong": return annotate(toAnsiDoc$1(self.value), bold);
		case "Text": return text$7(self.value);
		case "URI": return annotate(text$7(self.value), underlined);
		case "Weak": return annotate(toAnsiDoc$1(self.value), blackBright);
	}
};
//#endregion
//#region ../../node_modules/.bun/@effect+cli@0.77.2+74e017304edf4bf0/node_modules/@effect/cli/dist/esm/internal/helpDoc.js
/** @internal */
const isEmpty$2 = (helpDoc) => helpDoc._tag === "Empty";
/** @internal */
const isHeader = (helpDoc) => helpDoc._tag === "Header";
/** @internal */
const isParagraph = (helpDoc) => helpDoc._tag === "Paragraph";
/** @internal */
const isDescriptionList = (helpDoc) => helpDoc._tag === "DescriptionList";
/** @internal */
const empty$1 = { _tag: "Empty" };
/** @internal */
const sequence = /*#__PURE__*/ dual(2, (self, that) => {
	if (isEmpty$2(self)) return that;
	if (isEmpty$2(that)) return self;
	return {
		_tag: "Sequence",
		left: self,
		right: that
	};
});
/** @internal */
const blocks = (helpDocs) => {
	const elements = Arr.fromIterable(helpDocs);
	if (Arr.isNonEmptyReadonlyArray(elements)) return elements.slice(1).reduce(sequence, elements[0]);
	return empty$1;
};
/** @internal */
const getSpan = (self) => isHeader(self) || isParagraph(self) ? self.value : empty$2;
/** @internal */
const descriptionList = (definitions) => ({
	_tag: "DescriptionList",
	definitions
});
/** @internal */
const enumeration = (elements) => ({
	_tag: "Enumeration",
	elements
});
/** @internal */
const h1 = (value) => ({
	_tag: "Header",
	value: typeof value === "string" ? text$6(value) : value,
	level: 1
});
/** @internal */
const p = (value) => ({
	_tag: "Paragraph",
	value: typeof value === "string" ? text$6(value) : value
});
/** @internal */
const mapDescriptionList = /*#__PURE__*/ dual(2, (self, f) => isDescriptionList(self) ? descriptionList(Arr.map(self.definitions, ([span, helpDoc]) => f(span, helpDoc))) : self);
/** @internal */
const toAnsiDoc = (self) => optimize(toAnsiDocInternal(self), Deep);
/** @internal */
const toAnsiText = (self) => render$1(toAnsiDoc(self), { style: "pretty" });
const toAnsiDocInternal = (self) => {
	switch (self._tag) {
		case "Empty": return empty$3;
		case "Header": return pipe(annotate(toAnsiDoc$1(self.value), bold), cat(hardLine));
		case "Paragraph": return pipe(toAnsiDoc$1(self.value), cat(hardLine));
		case "DescriptionList": {
			const definitions = self.definitions.map(([span, doc]) => cats([
				annotate(toAnsiDoc$1(span), bold),
				empty$3,
				indent(toAnsiDocInternal(doc), 2)
			]));
			return vsep(definitions);
		}
		case "Enumeration": {
			const elements = self.elements.map((doc) => cat(text$7("- "), toAnsiDocInternal(doc)));
			return indent(vsep(elements), 2);
		}
		case "Sequence": return vsep([toAnsiDocInternal(self.left), toAnsiDocInternal(self.right)]);
	}
};
//#endregion
//#region ../../node_modules/.bun/@effect+cli@0.77.2+74e017304edf4bf0/node_modules/@effect/cli/dist/esm/internal/cliConfig.js
/** @internal */
const Tag = /*#__PURE__*/ Context.GenericTag("@effect/cli/CliConfig");
/** @internal */
const defaultConfig = {
	isCaseSensitive: false,
	autoCorrectLimit: 2,
	finalCheckBuiltIn: false,
	showAllNames: true,
	showBuiltIns: true,
	showTypes: true
};
/** @internal */
const normalizeCase = /*#__PURE__*/ dual(2, (self, text) => self.isCaseSensitive ? text : text.toLowerCase());
//#endregion
//#region ../../node_modules/.bun/@effect+platform@0.97.2+452b06a93f937da4/node_modules/@effect/platform/dist/esm/internal/terminal.js
/** @internal */
const tag = /*#__PURE__*/ GenericTag("@effect/platform/Terminal");
//#endregion
//#region ../../node_modules/.bun/@effect+platform@0.97.2+452b06a93f937da4/node_modules/@effect/platform/dist/esm/Terminal.js
/**
* A `QuitException` represents an exception that occurs when a user attempts to
* quit out of a `Terminal` prompt for input (usually by entering `ctrl`+`c`).
*
* @since 1.0.0
* @category model
*/
var QuitException = class extends (/*#__PURE__*/ TaggedError("QuitException")) {};
/**
* @since 1.0.0
* @category refinements
*/
const isQuitException = (u) => typeof u === "object" && u != null && "_tag" in u && u._tag === "QuitException";
/**
* @since 1.0.0
* @category tag
*/
const Terminal = tag;
//#endregion
//#region ../../node_modules/.bun/@effect+cli@0.77.2+74e017304edf4bf0/node_modules/@effect/cli/dist/esm/internal/prompt/action.js
/** @internal */
const Action = /*#__PURE__*/ Data$1.taggedEnum();
/** @internal */
const PromptTypeId = /*#__PURE__*/ Symbol.for("@effect/cli/Prompt");
/** @internal */
const proto$6 = {
	...Effectable.CommitPrototype,
	[PromptTypeId]: { _Output: (_) => _ },
	commit() {
		return run$3(this);
	},
	pipe() {
		return Pipeable.pipeArguments(this, arguments);
	}
};
/** @internal */
const isPrompt = (u) => typeof u === "object" && u != null && PromptTypeId in u;
/** @internal */
const custom = (initialState, handlers) => {
	const op = Object.create(proto$6);
	op._tag = "Loop";
	op.initialState = initialState;
	op.render = handlers.render;
	op.process = handlers.process;
	op.clear = handlers.clear;
	return op;
};
/** @internal */
const map$3 = /*#__PURE__*/ dual(2, (self, f) => flatMap(self, (a) => succeed(f(a))));
/** @internal */
const flatMap = /*#__PURE__*/ dual(2, (self, f) => {
	const op = Object.create(proto$6);
	op._tag = "OnSuccess";
	op.prompt = self;
	op.onSuccess = f;
	return op;
});
/** @internal */
const run$3 = /*#__PURE__*/ Effect$1.fnUntraced(function* (self) {
	const terminal = yield* Terminal;
	const input = yield* terminal.readInput;
	return yield* runWithInput(self, terminal, input);
}, /*#__PURE__*/ Effect$1.mapError(() => new QuitException()), Effect$1.scoped);
const runWithInput = (prompt, terminal, input) => Effect$1.suspend(() => {
	const op = prompt;
	switch (op._tag) {
		case "Loop": return runLoop(op, terminal, input);
		case "OnSuccess": return Effect$1.flatMap(runWithInput(op.prompt, terminal, input), (a) => runWithInput(op.onSuccess(a), terminal, input));
		case "Succeed": return Effect$1.succeed(op.value);
	}
});
const runLoop = /*#__PURE__*/ Effect$1.fnUntraced(function* (loop, terminal, input) {
	let state = Effect$1.isEffect(loop.initialState) ? yield* loop.initialState : loop.initialState;
	let action = Action.NextFrame({ state });
	while (true) {
		const msg = yield* loop.render(state, action);
		yield* Effect$1.orDie(terminal.display(msg));
		const event = yield* input.take;
		action = yield* loop.process(event, state);
		switch (action._tag) {
			case "Beep": continue;
			case "NextFrame":
				yield* Effect$1.orDie(terminal.display(yield* loop.clear(state, action)));
				state = action.state;
				continue;
			case "Submit": {
				yield* Effect$1.orDie(terminal.display(yield* loop.clear(state, action)));
				const msg = yield* loop.render(state, action);
				yield* Effect$1.orDie(terminal.display(msg));
				return action.value;
			}
		}
	}
}, (effect, _, terminal) => Effect$1.ensuring(effect, Effect$1.orDie(terminal.display(render$1(cursorShow, { style: "pretty" })))));
/** @internal */
const succeed = (value) => {
	const op = Object.create(proto$6);
	op._tag = "Succeed";
	op.value = value;
	return op;
};
//#endregion
//#region ../../node_modules/.bun/@effect+cli@0.77.2+74e017304edf4bf0/node_modules/@effect/cli/dist/esm/internal/prompt/ansi-utils.js
const defaultFigures = {
	arrowUp: /*#__PURE__*/ text$7("↑"),
	arrowDown: /*#__PURE__*/ text$7("↓"),
	arrowLeft: /*#__PURE__*/ text$7("←"),
	arrowRight: /*#__PURE__*/ text$7("→"),
	radioOn: /*#__PURE__*/ text$7("◉"),
	radioOff: /*#__PURE__*/ text$7("◯"),
	checkboxOn: /*#__PURE__*/ text$7("☒"),
	checkboxOff: /*#__PURE__*/ text$7("☐"),
	tick: /*#__PURE__*/ text$7("✔"),
	cross: /*#__PURE__*/ text$7("✖"),
	ellipsis: /*#__PURE__*/ text$7("…"),
	pointerSmall: /*#__PURE__*/ text$7("›"),
	line: /*#__PURE__*/ text$7("─"),
	pointer: /*#__PURE__*/ text$7("❯")
};
const windowsFigures = {
	arrowUp: defaultFigures.arrowUp,
	arrowDown: defaultFigures.arrowDown,
	arrowLeft: defaultFigures.arrowLeft,
	arrowRight: defaultFigures.arrowRight,
	radioOn: /*#__PURE__*/ text$7("(*)"),
	radioOff: /*#__PURE__*/ text$7("( )"),
	checkboxOn: /*#__PURE__*/ text$7("[*]"),
	checkboxOff: /*#__PURE__*/ text$7("[ ]"),
	tick: /*#__PURE__*/ text$7("√"),
	cross: /*#__PURE__*/ text$7("×"),
	ellipsis: /*#__PURE__*/ text$7("..."),
	pointerSmall: /*#__PURE__*/ text$7("»"),
	line: /*#__PURE__*/ text$7("─"),
	pointer: /*#__PURE__*/ text$7(">")
};
/** @internal */
const figures = /*#__PURE__*/ Effect$1.map(/*#__PURE__*/ Effect$1.sync(() => process.platform === "win32"), (isWindows) => isWindows ? windowsFigures : defaultFigures);
/**
* Clears all lines taken up by the specified `text`.
*
* @internal
*/
function eraseText(text, columns) {
	if (columns === 0) return cat(eraseLine, cursorTo(0));
	let rows = 0;
	const lines = text.split(/\r?\n/);
	for (const line of lines) rows += 1 + Math.floor(Math.max(line.length - 1, 0) / columns);
	return eraseLines(rows);
}
/** @internal */
function lines(prompt, columns) {
	const lines = prompt.split(/\r?\n/);
	return columns === 0 ? lines.length : pipe(Arr.map(lines, (line) => Math.ceil(line.length / columns)), Arr.reduce(0, (left, right) => left + right));
}
//#endregion
//#region ../../node_modules/.bun/@effect+cli@0.77.2+74e017304edf4bf0/node_modules/@effect/cli/dist/esm/internal/prompt/date.js
const renderBeep$5 = /*#__PURE__*/ render$1(beep, { style: "pretty" });
function handleClear$5(options) {
	return (state, _) => {
		return Effect$1.gen(function* () {
			const columns = yield* (yield* Terminal).columns;
			const resetCurrentLine = cat(eraseLine, cursorLeft);
			const clearError = Option$1.match(state.error, {
				onNone: () => empty$3,
				onSome: (error) => cursorDown(lines(error, columns)).pipe(cat(eraseText(`\n${error}`, columns)))
			});
			const clearOutput = eraseText(options.message, columns);
			return clearError.pipe(cat(clearOutput), cat(resetCurrentLine), optimize(Deep), render$1({
				style: "pretty",
				options: { lineWidth: columns }
			}));
		});
	};
}
const NEWLINE_REGEX$3 = /\r?\n/;
function renderError$2(state, pointer) {
	return Option$1.match(state.error, {
		onNone: () => empty$3,
		onSome: (error) => {
			const errorLines = error.split(NEWLINE_REGEX$3);
			if (Arr.isNonEmptyReadonlyArray(errorLines)) {
				const annotateLine = (line) => annotate(text$7(line), combine(italicized, red$1));
				const prefix = cat(annotate(pointer, red$1), space$1);
				const lines = Arr.map(errorLines, (str) => annotateLine(str));
				return cursorSavePosition.pipe(cat(hardLine), cat(prefix), cat(align(vsep(lines))), cat(cursorRestorePosition));
			}
			return empty$3;
		}
	});
}
function renderParts(state, submitted = false) {
	return Arr.reduce(state.dateParts, empty$3, (doc, part, currentIndex) => {
		const partDoc = text$7(part.toString());
		if (currentIndex === state.cursor && !submitted) {
			const annotation = combine(underlined, cyanBright);
			return cat(doc, annotate(partDoc, annotation));
		}
		return cat(doc, partDoc);
	});
}
function renderOutput$4(leadingSymbol, trailingSymbol, parts, options) {
	const annotateLine = (line) => annotate(text$7(line), bold);
	const prefix = cat(leadingSymbol, space$1);
	return Arr.match(options.message.split(/\r?\n/), {
		onEmpty: () => hsep([
			prefix,
			trailingSymbol,
			parts
		]),
		onNonEmpty: (promptLines) => {
			const lines = Arr.map(promptLines, (line) => annotateLine(line));
			return prefix.pipe(cat(nest(vsep(lines), 2)), cat(space$1), cat(trailingSymbol), cat(space$1), cat(parts));
		}
	});
}
function renderNextFrame$5(state, options) {
	return Effect$1.gen(function* () {
		const columns = yield* (yield* Terminal).columns;
		const figures$12 = yield* figures;
		const promptMsg = renderOutput$4(annotate(text$7("?"), cyanBright), annotate(figures$12.pointerSmall, blackBright), renderParts(state), options);
		const errorMsg = renderError$2(state, figures$12.pointerSmall);
		return cursorHide.pipe(cat(promptMsg), cat(errorMsg), optimize(Deep), render$1({
			style: "pretty",
			options: { lineWidth: columns }
		}));
	});
}
function renderSubmission$5(state, options) {
	return Effect$1.gen(function* () {
		const columns = yield* (yield* Terminal).columns;
		const figures$11 = yield* figures;
		return renderOutput$4(annotate(figures$11.tick, green), annotate(figures$11.ellipsis, blackBright), renderParts(state, true), options).pipe(cat(hardLine), optimize(Deep), render$1({
			style: "pretty",
			options: { lineWidth: columns }
		}));
	});
}
function processUp(state) {
	state.dateParts[state.cursor].increment();
	return Action.NextFrame({ state: {
		...state,
		typed: ""
	} });
}
function processDown(state) {
	state.dateParts[state.cursor].decrement();
	return Action.NextFrame({ state: {
		...state,
		typed: ""
	} });
}
function processCursorLeft$1(state) {
	const previousPart = state.dateParts[state.cursor].previousPart();
	return Option$1.match(previousPart, {
		onNone: () => Action.Beep(),
		onSome: (previous) => Action.NextFrame({ state: {
			...state,
			typed: "",
			cursor: state.dateParts.indexOf(previous)
		} })
	});
}
function processCursorRight$1(state) {
	const nextPart = state.dateParts[state.cursor].nextPart();
	return Option$1.match(nextPart, {
		onNone: () => Action.Beep(),
		onSome: (next) => Action.NextFrame({ state: {
			...state,
			typed: "",
			cursor: state.dateParts.indexOf(next)
		} })
	});
}
function processNext$1(state) {
	const nextPart = state.dateParts[state.cursor].nextPart();
	const cursor = Option$1.match(nextPart, {
		onNone: () => state.dateParts.findIndex((part) => !part.isToken()),
		onSome: (next) => state.dateParts.indexOf(next)
	});
	return Action.NextFrame({ state: {
		...state,
		cursor
	} });
}
function defaultProcessor$1(value, state) {
	if (/\d/.test(value)) {
		const typed = state.typed + value;
		state.dateParts[state.cursor].setValue(typed);
		return Action.NextFrame({ state: {
			...state,
			typed
		} });
	}
	return Action.Beep();
}
const defaultLocales = {
	months: [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December"
	],
	monthsShort: [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec"
	],
	weekdays: [
		"Sunday",
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday"
	],
	weekdaysShort: [
		"Sun",
		"Mon",
		"Tue",
		"Wed",
		"Thu",
		"Fri",
		"Sat"
	]
};
function handleRender$4(options) {
	return (state, action) => {
		return Action.$match(action, {
			Beep: () => Effect$1.succeed(renderBeep$5),
			NextFrame: ({ state }) => renderNextFrame$5(state, options),
			Submit: () => renderSubmission$5(state, options)
		});
	};
}
function handleProcess$4(options) {
	return (input, state) => {
		switch (input.key.name) {
			case "left": return Effect$1.succeed(processCursorLeft$1(state));
			case "right": return Effect$1.succeed(processCursorRight$1(state));
			case "k":
			case "up": return Effect$1.succeed(processUp(state));
			case "j":
			case "down": return Effect$1.succeed(processDown(state));
			case "tab": return Effect$1.succeed(processNext$1(state));
			case "enter":
			case "return": return Effect$1.match(options.validate(state.value), {
				onFailure: (error) => Action.NextFrame({ state: {
					...state,
					error: Option$1.some(error)
				} }),
				onSuccess: (value) => Action.Submit({ value })
			});
			default: {
				const value = Option$1.getOrElse(input.input, () => "");
				return Effect$1.succeed(defaultProcessor$1(value, state));
			}
		}
	};
}
/** @internal */
const date = (options) => {
	const opts = {
		initial: /* @__PURE__ */ new Date(),
		dateMask: "YYYY-MM-DD HH:mm:ss",
		validate: Effect$1.succeed,
		...options,
		locales: {
			...defaultLocales,
			...options.locales
		}
	};
	const dateParts = makeDateParts(opts.dateMask, opts.initial, opts.locales);
	const initialState = {
		dateParts,
		typed: "",
		cursor: dateParts.findIndex((part) => !part.isToken()),
		value: opts.initial,
		error: Option$1.none()
	};
	return custom(initialState, {
		render: handleRender$4(opts),
		process: handleProcess$4(opts),
		clear: handleClear$5(opts)
	});
};
const DATE_PART_REGEX = /\\(.)|"((?:\\["\\]|[^"])+)"|(D[Do]?|d{3,4}|d)|(M{1,4})|(YY(?:YY)?)|([aA])|([Hh]{1,2})|(m{1,2})|(s{1,2})|(S{1,4})|./g;
const regexGroups = {
	1: ({ token, ...opts }) => new Token({
		token: token.replace(/\\(.)/g, "$1"),
		...opts
	}),
	2: (opts) => new Day(opts),
	3: (opts) => new Month(opts),
	4: (opts) => new Year(opts),
	5: (opts) => new Meridiem(opts),
	6: (opts) => new Hours(opts),
	7: (opts) => new Minutes(opts),
	8: (opts) => new Seconds(opts),
	9: (opts) => new Milliseconds(opts)
};
const makeDateParts = (dateMask, date, locales) => {
	const parts = [];
	let result = null;
	while (result = DATE_PART_REGEX.exec(dateMask)) {
		const match = result.shift();
		const index = result.findIndex((group) => group !== void 0);
		if (index in regexGroups) {
			const token = result[index] || match;
			parts.push(regexGroups[index]({
				token,
				date,
				parts,
				locales
			}));
		} else parts.push(new Token({
			token: result[index] || match,
			date,
			parts,
			locales
		}));
	}
	const orderedParts = parts.reduce((array, element) => {
		const lastElement = array[array.length - 1];
		if (element.isToken() && lastElement !== void 0 && lastElement.isToken()) lastElement.setValue(element.token);
		else array.push(element);
		return array;
	}, Arr.empty());
	parts.splice(0, parts.length, ...orderedParts);
	return parts;
};
var DatePart = class {
	token;
	date;
	parts;
	locales;
	constructor(params) {
		this.token = params.token;
		this.locales = params.locales;
		this.date = params.date || /* @__PURE__ */ new Date();
		this.parts = params.parts || [this];
	}
	/**
	* Returns `true` if this `DatePart` is a `Token`, `false` otherwise.
	*/
	isToken() {
		return false;
	}
	/**
	* Retrieves the next date part in the list of parts.
	*/
	nextPart() {
		return Arr.findFirstIndex(this.parts, (part) => part === this).pipe(Option$1.flatMap((currentPartIndex) => Arr.findFirst(this.parts.slice(currentPartIndex + 1), (part) => !part.isToken())));
	}
	/**
	* Retrieves the previous date part in the list of parts.
	*/
	previousPart() {
		return Arr.findFirstIndex(this.parts, (part) => part === this).pipe(Option$1.flatMap((currentPartIndex) => Arr.findLast(this.parts.slice(0, currentPartIndex), (part) => !part.isToken())));
	}
	toString() {
		return String(this.date);
	}
};
var Token = class extends DatePart {
	increment() {}
	decrement() {}
	setValue(value) {
		this.token = this.token + value;
	}
	isToken() {
		return true;
	}
	toString() {
		return this.token;
	}
};
var Milliseconds = class extends DatePart {
	increment() {
		this.date.setMilliseconds(this.date.getMilliseconds() + 1);
	}
	decrement() {
		this.date.setMilliseconds(this.date.getMilliseconds() - 1);
	}
	setValue(value) {
		this.date.setMilliseconds(Number.parseInt(value.slice(-this.token.length)));
	}
	toString() {
		return `${this.date.getMilliseconds()}`.padStart(4, "0").substring(0, this.token.length);
	}
};
var Seconds = class extends DatePart {
	increment() {
		this.date.setSeconds(this.date.getSeconds() + 1);
	}
	decrement() {
		this.date.setSeconds(this.date.getSeconds() - 1);
	}
	setValue(value) {
		this.date.setSeconds(Number.parseInt(value.slice(-2)));
	}
	toString() {
		const seconds = `${this.date.getSeconds()}`;
		return this.token.length > 1 ? seconds.padStart(2, "0") : seconds;
	}
};
var Minutes = class extends DatePart {
	increment() {
		this.date.setMinutes(this.date.getMinutes() + 1);
	}
	decrement() {
		this.date.setMinutes(this.date.getMinutes() - 1);
	}
	setValue(value) {
		this.date.setMinutes(Number.parseInt(value.slice(-2)));
	}
	toString() {
		const minutes = `${this.date.getMinutes()}`;
		return this.token.length > 1 ? minutes.padStart(2, "0") : minutes;
	}
};
var Hours = class extends DatePart {
	increment() {
		this.date.setHours(this.date.getHours() + 1);
	}
	decrement() {
		this.date.setHours(this.date.getHours() - 1);
	}
	setValue(value) {
		this.date.setHours(Number.parseInt(value.slice(-2)));
	}
	toString() {
		const hours = /h/.test(this.token) ? this.date.getHours() % 12 || 12 : this.date.getHours();
		return this.token.length > 1 ? `${hours}`.padStart(2, "0") : `${hours}`;
	}
};
var Day = class extends DatePart {
	increment() {
		this.date.setDate(this.date.getDate() + 1);
	}
	decrement() {
		this.date.setDate(this.date.getDate() - 1);
	}
	setValue(value) {
		this.date.setDate(Number.parseInt(value.slice(-2)));
	}
	toString() {
		const date = this.date.getDate();
		const day = this.date.getDay();
		return Match.value(this.token).pipe(Match.when("DD", () => `${date}`.padStart(2, "0")), Match.when("Do", () => `${date}${this.ordinalIndicator(date)}`), Match.when("d", () => `${day + 1}`), Match.when("ddd", () => this.locales.weekdaysShort[day]), Match.when("dddd", () => this.locales.weekdays[day]), Match.orElse(() => `${date}`));
	}
	ordinalIndicator(day) {
		return Match.value(day % 10).pipe(Match.when(1, () => "st"), Match.when(2, () => "nd"), Match.when(3, () => "rd"), Match.orElse(() => "th"));
	}
};
var Month = class extends DatePart {
	increment() {
		this.date.setMonth(this.date.getMonth() + 1);
	}
	decrement() {
		this.date.setMonth(this.date.getMonth() - 1);
	}
	setValue(value) {
		const month = Number.parseInt(value.slice(-2)) - 1;
		this.date.setMonth(month < 0 ? 0 : month);
	}
	toString() {
		const month = this.date.getMonth();
		return Match.value(this.token.length).pipe(Match.when(2, () => `${month + 1}`.padStart(2, "0")), Match.when(3, () => this.locales.monthsShort[month]), Match.when(4, () => this.locales.months[month]), Match.orElse(() => `${month + 1}`));
	}
};
var Year = class extends DatePart {
	increment() {
		this.date.setFullYear(this.date.getFullYear() + 1);
	}
	decrement() {
		this.date.setFullYear(this.date.getFullYear() - 1);
	}
	setValue(value) {
		this.date.setFullYear(Number.parseInt(value.slice(-4)));
	}
	toString() {
		const year = `${this.date.getFullYear()}`.padStart(4, "0");
		return this.token.length === 2 ? year.substring(-2) : year;
	}
};
var Meridiem = class extends DatePart {
	increment() {
		this.date.setHours((this.date.getHours() + 12) % 24);
	}
	decrement() {
		this.increment();
	}
	setValue(_value) {}
	toString() {
		const meridiem = this.date.getHours() > 12 ? "pm" : "am";
		return /A/.test(this.token) ? meridiem.toUpperCase() : meridiem;
	}
};
//#endregion
//#region ../../node_modules/.bun/@effect+platform@0.97.2+452b06a93f937da4/node_modules/@effect/platform/dist/esm/internal/path.js
/** @internal */
const TypeId$4 = /*#__PURE__*/ Symbol.for("@effect/platform/Path");
/** @internal */
const Path$2 = /*#__PURE__*/ GenericTag("@effect/platform/Path");
//#endregion
//#region ../../node_modules/.bun/@effect+platform@0.97.2+452b06a93f937da4/node_modules/@effect/platform/dist/esm/Path.js
/**
* @since 1.0.0
*/
/**
* @since 1.0.0
* @category type ids
*/
const TypeId$3 = TypeId$4;
/**
* @since 1.0.0
* @category tag
*/
const Path$1 = Path$2;
//#endregion
//#region ../../node_modules/.bun/@effect+cli@0.77.2+74e017304edf4bf0/node_modules/@effect/cli/dist/esm/internal/prompt/utils.js
/** @internal */
const entriesToDisplay = (cursor, total, maxVisible) => {
	const max = maxVisible === void 0 ? total : maxVisible;
	let startIndex = Math.min(total - max, cursor - Math.floor(max / 2));
	if (startIndex < 0) startIndex = 0;
	const endIndex = Math.min(startIndex + max, total);
	return {
		startIndex,
		endIndex
	};
};
//#endregion
//#region ../../node_modules/.bun/@effect+cli@0.77.2+74e017304edf4bf0/node_modules/@effect/cli/dist/esm/internal/prompt/file.js
const CONFIRM_MESSAGE = "The selected directory contains files. Would you like to traverse the selected directory?";
const Confirm = /*#__PURE__*/ Data$1.taggedEnum();
const showConfirmation = /*#__PURE__*/ Confirm.$is("Show");
const renderBeep$4 = /*#__PURE__*/ render$1(beep, { style: "pretty" });
function resolveCurrentPath(path, options) {
	return Option$1.match(path, {
		onNone: () => Option$1.match(options.startingPath, {
			onNone: () => Effect$1.sync(() => process.cwd()),
			onSome: (path) => Effect$1.flatMap(FileSystem, (fs) => Effect$1.orDie(fs.exists(path)).pipe(Effect$1.filterOrDieMessage(identity, `The provided starting path '${path}' does not exist`), Effect$1.as(path)))
		}),
		onSome: (path) => Effect$1.succeed(path)
	});
}
function getFileList(directory, options) {
	return Effect$1.gen(function* () {
		const fs = yield* FileSystem;
		const path = yield* Path$1;
		const files = yield* Effect$1.orDie(fs.readDirectory(directory)).pipe(Effect$1.map((files) => ["..", ...files]));
		return yield* Effect$1.filter(files, (file) => {
			const result = options.filter(file);
			const userDefinedFilter = Effect$1.isEffect(result) ? result : Effect$1.succeed(result);
			const directoryFilter = options.type === "directory" ? Effect$1.map(Effect$1.orDie(fs.stat(path.join(directory, file))), (info) => info.type === "Directory") : Effect$1.succeed(true);
			return Effect$1.zipWith(userDefinedFilter, directoryFilter, (a, b) => a && b);
		}, { concurrency: files.length });
	});
}
function handleClear$4(options) {
	return (state, _) => {
		return Effect$1.gen(function* () {
			const columns = yield* (yield* Terminal).columns;
			const currentPath = yield* resolveCurrentPath(state.path, options);
			const text = "\n".repeat(Math.min(state.files.length, options.maxPerPage));
			const clearPath = eraseText(currentPath, columns);
			const clearPrompt = eraseText(`\n${showConfirmation(state.confirm) ? CONFIRM_MESSAGE : options.message}`, columns);
			return eraseText(text, columns).pipe(cat(clearPath), cat(clearPrompt), optimize(Deep), render$1({
				style: "pretty",
				options: { lineWidth: columns }
			}));
		});
	};
}
const NEWLINE_REGEX$2 = /\r?\n/;
function renderPrompt(confirm, message, leadingSymbol, trailingSymbol) {
	const annotateLine = (line) => annotate(text$7(line), bold);
	const prefix = cat(leadingSymbol, space$1);
	return Arr.match(message.split(NEWLINE_REGEX$2), {
		onEmpty: () => hsep([
			prefix,
			trailingSymbol,
			confirm
		]),
		onNonEmpty: (promptLines) => {
			const lines = Arr.map(promptLines, (line) => annotateLine(line));
			return prefix.pipe(cat(nest(vsep(lines), 2)), cat(space$1), cat(trailingSymbol), cat(space$1), cat(confirm));
		}
	});
}
function renderPrefix(state, toDisplay, currentIndex, length, figures) {
	let prefix = space$1;
	if (currentIndex === toDisplay.startIndex && toDisplay.startIndex > 0) prefix = figures.arrowUp;
	else if (currentIndex === toDisplay.endIndex - 1 && toDisplay.endIndex < length) prefix = figures.arrowDown;
	return state.cursor === currentIndex ? figures.pointer.pipe(annotate(cyanBright), cat(prefix)) : prefix.pipe(cat(space$1));
}
function renderFileName(file, isSelected) {
	return isSelected ? annotate(text$7(file), combine(underlined, cyanBright)) : text$7(file);
}
function renderFiles(state, files, figures, options) {
	const length = files.length;
	const toDisplay = entriesToDisplay(state.cursor, length, options.maxPerPage);
	const documents = [];
	for (let index = toDisplay.startIndex; index < toDisplay.endIndex; index++) {
		const isSelected = state.cursor === index;
		const prefix = renderPrefix(state, toDisplay, index, length, figures);
		const fileName = renderFileName(files[index], isSelected);
		documents.push(cat(prefix, fileName));
	}
	return vsep(documents);
}
function renderNextFrame$4(state, options) {
	return Effect$1.gen(function* () {
		const path = yield* Path$1;
		const columns = yield* (yield* Terminal).columns;
		const figures$10 = yield* figures;
		const currentPath = yield* resolveCurrentPath(state.path, options);
		const selectedPath = state.files[state.cursor];
		const resolvedPath = path.resolve(currentPath, selectedPath);
		const resolvedPathMsg = figures$10.pointerSmall.pipe(cat(space$1), cat(text$7(resolvedPath)), annotate(blackBright));
		if (showConfirmation(state.confirm)) {
			const leadingSymbol = annotate(text$7("?"), cyanBright);
			const trailingSymbol = annotate(figures$10.pointerSmall, blackBright);
			const promptMsg = renderPrompt(annotate(text$7("(Y/n)"), blackBright), CONFIRM_MESSAGE, leadingSymbol, trailingSymbol);
			return cursorHide.pipe(cat(promptMsg), cat(hardLine), cat(resolvedPathMsg), optimize(Deep), render$1({
				style: "pretty",
				options: { lineWidth: columns }
			}));
		}
		const leadingSymbol = annotate(figures$10.tick, green);
		const trailingSymbol = annotate(figures$10.ellipsis, blackBright);
		const promptMsg = renderPrompt(empty$3, options.message, leadingSymbol, trailingSymbol);
		const files = renderFiles(state, state.files, figures$10, options);
		return cursorHide.pipe(cat(promptMsg), cat(hardLine), cat(resolvedPathMsg), cat(hardLine), cat(files), optimize(Deep), render$1({
			style: "pretty",
			options: { lineWidth: columns }
		}));
	});
}
function renderSubmission$4(value, options) {
	return Effect$1.gen(function* () {
		const columns = yield* (yield* Terminal).columns;
		const figures$9 = yield* figures;
		const leadingSymbol = annotate(figures$9.tick, green);
		const trailingSymbol = annotate(figures$9.ellipsis, blackBright);
		return renderPrompt(empty$3, options.message, leadingSymbol, trailingSymbol).pipe(cat(space$1), cat(annotate(text$7(value), white$1)), cat(hardLine), render$1({
			style: "pretty",
			options: { lineWidth: columns }
		}));
	});
}
function handleRender$3(options) {
	return (_, action) => {
		return Action.$match(action, {
			Beep: () => Effect$1.succeed(renderBeep$4),
			NextFrame: ({ state }) => renderNextFrame$4(state, options),
			Submit: ({ value }) => renderSubmission$4(value, options)
		});
	};
}
function processCursorUp$1(state) {
	const cursor = state.cursor - 1;
	return Effect$1.succeed(Action.NextFrame({ state: {
		...state,
		cursor: cursor < 0 ? state.files.length - 1 : cursor
	} }));
}
function processCursorDown$1(state) {
	return Effect$1.succeed(Action.NextFrame({ state: {
		...state,
		cursor: (state.cursor + 1) % state.files.length
	} }));
}
function processSelection(state, options) {
	return Effect$1.gen(function* () {
		const fs = yield* FileSystem;
		const path = yield* Path$1;
		const currentPath = yield* resolveCurrentPath(state.path, options);
		const selectedPath = state.files[state.cursor];
		const resolvedPath = path.resolve(currentPath, selectedPath);
		if ((yield* Effect$1.orDie(fs.stat(resolvedPath))).type === "Directory") {
			const files = yield* getFileList(resolvedPath, options);
			const filesWithoutParent = files.filter((file) => file !== "..");
			if (options.type === "directory" || options.type === "either") return filesWithoutParent.length === 0 ? Action.Submit({ value: resolvedPath }) : Action.NextFrame({ state: {
				...state,
				confirm: Confirm.Show()
			} });
			return Action.NextFrame({ state: {
				cursor: 0,
				files,
				path: Option$1.some(resolvedPath),
				confirm: Confirm.Hide()
			} });
		}
		return Action.Submit({ value: resolvedPath });
	});
}
function handleProcess$3(options) {
	return (input, state) => Effect$1.gen(function* () {
		switch (input.key.name) {
			case "k":
			case "up": return yield* processCursorUp$1(state);
			case "j":
			case "down":
			case "tab": return yield* processCursorDown$1(state);
			case "enter":
			case "return": return yield* processSelection(state, options);
			case "y":
			case "t":
				if (showConfirmation(state.confirm)) {
					const path = yield* Path$1;
					const currentPath = yield* resolveCurrentPath(state.path, options);
					const selectedPath = state.files[state.cursor];
					const resolvedPath = path.resolve(currentPath, selectedPath);
					const files = yield* getFileList(resolvedPath, options);
					return Action.NextFrame({ state: {
						cursor: 0,
						files,
						path: Option$1.some(resolvedPath),
						confirm: Confirm.Hide()
					} });
				}
				return Action.Beep();
			case "n":
			case "f":
				if (showConfirmation(state.confirm)) {
					const path = yield* Path$1;
					const currentPath = yield* resolveCurrentPath(state.path, options);
					const selectedPath = state.files[state.cursor];
					const resolvedPath = path.resolve(currentPath, selectedPath);
					return Action.Submit({ value: resolvedPath });
				}
				return Action.Beep();
			default: return Action.Beep();
		}
	});
}
/** @internal */
const file = (options = {}) => {
	const opts = {
		type: options.type ?? "file",
		message: options.message ?? `Choose a file`,
		startingPath: Option$1.fromNullable(options.startingPath),
		maxPerPage: options.maxPerPage ?? 10,
		filter: options.filter ?? (() => Effect$1.succeed(true))
	};
	const initialState = Effect$1.gen(function* () {
		const path = Option$1.none();
		return {
			cursor: 0,
			files: yield* getFileList(yield* resolveCurrentPath(path, opts), opts),
			path,
			confirm: Confirm.Hide()
		};
	});
	return custom(initialState, {
		render: handleRender$3(opts),
		process: handleProcess$3(opts),
		clear: handleClear$4(opts)
	});
};
//#endregion
//#region ../../node_modules/.bun/@effect+cli@0.77.2+74e017304edf4bf0/node_modules/@effect/cli/dist/esm/internal/prompt/number.js
const parseInt = /*#__PURE__*/ Schema.NumberFromString.pipe(/*#__PURE__*/ Schema.int(), Schema.decodeUnknown);
const parseFloat = /*#__PURE__*/ Schema.decodeUnknown(Schema.NumberFromString);
const renderBeep$3 = /*#__PURE__*/ render$1(beep, { style: "pretty" });
function handleClear$3(options) {
	return (state, _) => {
		return Effect$1.gen(function* () {
			const columns = yield* (yield* Terminal).columns;
			const resetCurrentLine = cat(eraseLine, cursorLeft);
			const clearError = Option$1.match(state.error, {
				onNone: () => empty$3,
				onSome: (error) => cursorDown(lines(error, columns)).pipe(cat(eraseText(`\n${error}`, columns)))
			});
			const clearOutput = eraseText(options.message, columns);
			return clearError.pipe(cat(clearOutput), cat(resetCurrentLine), optimize(Deep), render$1({
				style: "pretty",
				options: { lineWidth: columns }
			}));
		});
	};
}
function renderInput$1(state, submitted) {
	const annotation = Option$1.match(state.error, {
		onNone: () => combine(underlined, cyanBright),
		onSome: () => red$1
	});
	const value = state.value === "" ? empty$3 : text$7(`${state.value}`);
	return submitted ? value : annotate(value, annotation);
}
const NEWLINE_REGEX$1 = /\r?\n/;
function renderError$1(state, pointer) {
	return Option$1.match(state.error, {
		onNone: () => empty$3,
		onSome: (error) => Arr.match(error.split(NEWLINE_REGEX$1), {
			onEmpty: () => empty$3,
			onNonEmpty: (errorLines) => {
				const annotateLine = (line) => annotate(text$7(line), combine(italicized, red$1));
				const prefix = cat(annotate(pointer, red$1), space$1);
				const lines = Arr.map(errorLines, (str) => annotateLine(str));
				return cursorSavePosition.pipe(cat(hardLine), cat(prefix), cat(align(vsep(lines))), cat(cursorRestorePosition));
			}
		})
	});
}
function renderOutput$3(state, leadingSymbol, trailingSymbol, options, submitted = false) {
	const annotateLine = (line) => annotate(text$7(line), bold);
	const prefix = cat(leadingSymbol, space$1);
	return Arr.match(options.message.split(/\r?\n/), {
		onEmpty: () => hsep([
			prefix,
			trailingSymbol,
			renderInput$1(state, submitted)
		]),
		onNonEmpty: (promptLines) => {
			const lines = Arr.map(promptLines, (line) => annotateLine(line));
			return prefix.pipe(cat(nest(vsep(lines), 2)), cat(space$1), cat(trailingSymbol), cat(space$1), cat(renderInput$1(state, submitted)));
		}
	});
}
function renderNextFrame$3(state, options) {
	return Effect$1.gen(function* () {
		const columns = yield* (yield* Terminal).columns;
		const figures$8 = yield* figures;
		const leadingSymbol = annotate(text$7("?"), cyanBright);
		const trailingSymbol = annotate(figures$8.pointerSmall, blackBright);
		const errorMsg = renderError$1(state, figures$8.pointerSmall);
		return renderOutput$3(state, leadingSymbol, trailingSymbol, options).pipe(cat(errorMsg), optimize(Deep), render$1({
			style: "pretty",
			options: { lineWidth: columns }
		}));
	});
}
function renderSubmission$3(nextState, options) {
	return Effect$1.gen(function* () {
		const columns = yield* (yield* Terminal).columns;
		const figures$7 = yield* figures;
		return renderOutput$3(nextState, annotate(figures$7.tick, green), annotate(figures$7.ellipsis, blackBright), options, true).pipe(cat(hardLine), optimize(Deep), render$1({
			style: "pretty",
			options: { lineWidth: columns }
		}));
	});
}
function processBackspace$1(state) {
	if (state.value.length <= 0) return Effect$1.succeed(Action.Beep());
	const value = state.value.slice(0, state.value.length - 1);
	return Effect$1.succeed(Action.NextFrame({ state: {
		...state,
		value,
		error: Option$1.none()
	} }));
}
function defaultIntProcessor(state, input) {
	if (state.value.length === 0 && input === "-") return Effect$1.succeed(Action.NextFrame({ state: {
		...state,
		value: "-",
		error: Option$1.none()
	} }));
	return Effect$1.match(parseInt(state.value + input), {
		onFailure: () => Action.Beep(),
		onSuccess: (value) => Action.NextFrame({ state: {
			...state,
			value: `${value}`,
			error: Option$1.none()
		} })
	});
}
function defaultFloatProcessor(state, input) {
	if (input === "." && state.value.includes(".")) return Effect$1.succeed(Action.Beep());
	if (state.value.length === 0 && input === "-") return Effect$1.succeed(Action.NextFrame({ state: {
		...state,
		value: "-",
		error: Option$1.none()
	} }));
	return Effect$1.match(parseFloat(state.value + input), {
		onFailure: () => Action.Beep(),
		onSuccess: (value) => Action.NextFrame({ state: {
			...state,
			value: input === "." ? `${value}.` : `${value}`,
			error: Option$1.none()
		} })
	});
}
const initialState$1 = {
	cursor: 0,
	value: "",
	error: /*#__PURE__*/ Option$1.none()
};
function handleRenderInteger(options) {
	return (state, action) => {
		return Action.$match(action, {
			Beep: () => Effect$1.succeed(renderBeep$3),
			NextFrame: ({ state }) => renderNextFrame$3(state, options),
			Submit: () => renderSubmission$3(state, options)
		});
	};
}
function handleProcessInteger(options) {
	return (input, state) => {
		switch (input.key.name) {
			case "backspace": return processBackspace$1(state);
			case "k":
			case "up": return Effect$1.succeed(Action.NextFrame({ state: {
				...state,
				value: state.value === "" || state.value === "-" ? `${options.incrementBy}` : `${Number.parseInt(state.value) + options.incrementBy}`,
				error: Option$1.none()
			} }));
			case "j":
			case "down": return Effect$1.succeed(Action.NextFrame({ state: {
				...state,
				value: state.value === "" || state.value === "-" ? `-${options.decrementBy}` : `${Number.parseInt(state.value) - options.decrementBy}`,
				error: Option$1.none()
			} }));
			case "enter":
			case "return": return Effect$1.matchEffect(parseInt(state.value), {
				onFailure: () => Effect$1.succeed(Action.NextFrame({ state: {
					...state,
					error: Option$1.some("Must provide an integer value")
				} })),
				onSuccess: (n) => Effect$1.match(options.validate(n), {
					onFailure: (error) => Action.NextFrame({ state: {
						...state,
						error: Option$1.some(error)
					} }),
					onSuccess: (value) => Action.Submit({ value })
				})
			});
			default: return defaultIntProcessor(state, Option$1.getOrElse(input.input, () => ""));
		}
	};
}
/** @internal */
const integer = (options) => {
	const opts = {
		min: Number.NEGATIVE_INFINITY,
		max: Number.POSITIVE_INFINITY,
		incrementBy: 1,
		decrementBy: 1,
		validate: (n) => {
			if (n < opts.min) return Effect$1.fail(`${n} must be greater than or equal to ${opts.min}`);
			if (n > opts.max) return Effect$1.fail(`${n} must be less than or equal to ${opts.max}`);
			return Effect$1.succeed(n);
		},
		...options
	};
	return custom(initialState$1, {
		render: handleRenderInteger(opts),
		process: handleProcessInteger(opts),
		clear: handleClear$3(opts)
	});
};
function handleRenderFloat(options) {
	return (state, action) => {
		return Action.$match(action, {
			Beep: () => Effect$1.succeed(renderBeep$3),
			NextFrame: ({ state }) => renderNextFrame$3(state, options),
			Submit: () => renderSubmission$3(state, options)
		});
	};
}
function handleProcessFloat(options) {
	return (input, state) => {
		switch (input.key.name) {
			case "backspace": return processBackspace$1(state);
			case "k":
			case "up": return Effect$1.succeed(Action.NextFrame({ state: {
				...state,
				value: state.value === "" || state.value === "-" ? `${options.incrementBy}` : `${Number.parseFloat(state.value) + options.incrementBy}`,
				error: Option$1.none()
			} }));
			case "j":
			case "down": return Effect$1.succeed(Action.NextFrame({ state: {
				...state,
				value: state.value === "" || state.value === "-" ? `-${options.decrementBy}` : `${Number.parseFloat(state.value) - options.decrementBy}`,
				error: Option$1.none()
			} }));
			case "enter":
			case "return": return Effect$1.matchEffect(parseFloat(state.value), {
				onFailure: () => Effect$1.succeed(Action.NextFrame({ state: {
					...state,
					error: Option$1.some("Must provide a floating point value")
				} })),
				onSuccess: (n) => Effect$1.flatMap(Effect$1.sync(() => EffectNumber.round(n, options.precision)), (rounded) => Effect$1.match(options.validate(rounded), {
					onFailure: (error) => Action.NextFrame({ state: {
						...state,
						error: Option$1.some(error)
					} }),
					onSuccess: (value) => Action.Submit({ value })
				}))
			});
			default: return defaultFloatProcessor(state, Option$1.getOrElse(input.input, () => ""));
		}
	};
}
/** @internal */
const float = (options) => {
	const opts = {
		min: Number.NEGATIVE_INFINITY,
		max: Number.POSITIVE_INFINITY,
		incrementBy: 1,
		decrementBy: 1,
		precision: 2,
		validate: (n) => {
			if (n < opts.min) return Effect$1.fail(`${n} must be greater than or equal to ${opts.min}`);
			if (n > opts.max) return Effect$1.fail(`${n} must be less than or equal to ${opts.max}`);
			return Effect$1.succeed(n);
		},
		...options
	};
	return custom(initialState$1, {
		render: handleRenderFloat(opts),
		process: handleProcessFloat(opts),
		clear: handleClear$3(opts)
	});
};
//#endregion
//#region ../../node_modules/.bun/@effect+cli@0.77.2+74e017304edf4bf0/node_modules/@effect/cli/dist/esm/internal/prompt/select.js
const renderBeep$2 = /*#__PURE__*/ render$1(beep, { style: "pretty" });
const NEWLINE_REGEX = /\r?\n/;
function renderOutput$2(leadingSymbol, trailingSymbol, options) {
	const annotateLine = (line) => annotate(text$7(line), bold);
	const prefix = cat(leadingSymbol, space$1);
	return Arr.match(options.message.split(NEWLINE_REGEX), {
		onEmpty: () => hsep([prefix, trailingSymbol]),
		onNonEmpty: (promptLines) => {
			const lines = Arr.map(promptLines, (line) => annotateLine(line));
			return prefix.pipe(cat(nest(vsep(lines), 2)), cat(space$1), cat(trailingSymbol), cat(space$1));
		}
	});
}
function renderChoicePrefix(state, choices, toDisplay, currentIndex, figures) {
	let prefix = space$1;
	if (currentIndex === toDisplay.startIndex && toDisplay.startIndex > 0) prefix = figures.arrowUp;
	else if (currentIndex === toDisplay.endIndex - 1 && toDisplay.endIndex < choices.length) prefix = figures.arrowDown;
	if (choices[currentIndex].disabled) {
		const annotation = combine(bold, blackBright);
		return state === currentIndex ? figures.pointer.pipe(annotate(annotation), cat(prefix)) : prefix.pipe(cat(space$1));
	}
	return state === currentIndex ? figures.pointer.pipe(annotate(cyanBright), cat(prefix)) : prefix.pipe(cat(space$1));
}
function renderChoiceTitle(choice, isSelected) {
	const title = text$7(choice.title);
	if (isSelected) return choice.disabled ? annotate(title, combine(underlined, blackBright)) : annotate(title, combine(underlined, cyanBright));
	return choice.disabled ? annotate(title, combine(strikethrough, blackBright)) : title;
}
function renderChoiceDescription(choice, isSelected) {
	if (!choice.disabled && choice.description && isSelected) return char("-").pipe(cat(space$1), cat(text$7(choice.description)), annotate(blackBright));
	return empty$3;
}
function renderChoices(state, options, figures) {
	const choices = options.choices;
	const toDisplay = entriesToDisplay(state, choices.length, options.maxPerPage);
	const documents = [];
	for (let index = toDisplay.startIndex; index < toDisplay.endIndex; index++) {
		const choice = choices[index];
		const isSelected = state === index;
		const prefix = renderChoicePrefix(state, choices, toDisplay, index, figures);
		const title = renderChoiceTitle(choice, isSelected);
		const description = renderChoiceDescription(choice, isSelected);
		documents.push(prefix.pipe(cat(title), cat(space$1), cat(description)));
	}
	return vsep(documents);
}
function renderNextFrame$2(state, options) {
	return Effect$1.gen(function* () {
		const columns = yield* (yield* Terminal).columns;
		const figures$5 = yield* figures;
		const choices = renderChoices(state, options, figures$5);
		const promptMsg = renderOutput$2(annotate(text$7("?"), cyanBright), annotate(figures$5.pointerSmall, blackBright), options);
		return cursorHide.pipe(cat(promptMsg), cat(hardLine), cat(choices), render$1({
			style: "pretty",
			options: { lineWidth: columns }
		}));
	});
}
function renderSubmission$2(state, options) {
	return Effect$1.gen(function* () {
		const columns = yield* (yield* Terminal).columns;
		const figures$6 = yield* figures;
		const selected = text$7(options.choices[state].title);
		return renderOutput$2(annotate(figures$6.tick, green), annotate(figures$6.ellipsis, blackBright), options).pipe(cat(space$1), cat(annotate(selected, white$1)), cat(hardLine), render$1({
			style: "pretty",
			options: { lineWidth: columns }
		}));
	});
}
function processCursorUp(state, choices) {
	if (state === 0) return Effect$1.succeed(Action.NextFrame({ state: choices.length - 1 }));
	return Effect$1.succeed(Action.NextFrame({ state: state - 1 }));
}
function processCursorDown(state, choices) {
	if (state === choices.length - 1) return Effect$1.succeed(Action.NextFrame({ state: 0 }));
	return Effect$1.succeed(Action.NextFrame({ state: state + 1 }));
}
function processNext(state, choices) {
	return Effect$1.succeed(Action.NextFrame({ state: (state + 1) % choices.length }));
}
function handleRender$2(options) {
	return (state, action) => {
		return Action.$match(action, {
			Beep: () => Effect$1.succeed(renderBeep$2),
			NextFrame: ({ state }) => renderNextFrame$2(state, options),
			Submit: () => renderSubmission$2(state, options)
		});
	};
}
function handleClear$2(options) {
	return Effect$1.gen(function* () {
		const columns = yield* (yield* Terminal).columns;
		const clearPrompt = cat(eraseLine, cursorLeft);
		return eraseText("\n".repeat(Math.min(options.choices.length, options.maxPerPage)) + options.message, columns).pipe(cat(clearPrompt), optimize(Deep), render$1({
			style: "pretty",
			options: { lineWidth: columns }
		}));
	});
}
function handleProcess$2(options) {
	return (input, state) => {
		switch (input.key.name) {
			case "k":
			case "up": return processCursorUp(state, options.choices);
			case "j":
			case "down": return processCursorDown(state, options.choices);
			case "tab": return processNext(state, options.choices);
			case "enter":
			case "return": {
				const selected = options.choices[state];
				if (selected.disabled) return Effect$1.succeed(Action.Beep());
				return Effect$1.succeed(Action.Submit({ value: selected.value }));
			}
			default: return Effect$1.succeed(Action.Beep());
		}
	};
}
/** @internal */
const select = (options) => {
	const opts = {
		maxPerPage: 10,
		...options
	};
	let initialIndex = 0;
	let seenSelected = -1;
	for (let i = 0; i < opts.choices.length; i++) if (opts.choices[i].selected === true) {
		if (seenSelected !== -1) throw new Error("InvalidArgumentException: only a single choice can be selected by default for Prompt.select");
		seenSelected = i;
	}
	if (seenSelected !== -1) initialIndex = seenSelected;
	return custom(initialIndex, {
		render: handleRender$2(opts),
		process: handleProcess$2(opts),
		clear: () => handleClear$2(opts)
	});
};
//#endregion
//#region ../../node_modules/.bun/@effect+cli@0.77.2+74e017304edf4bf0/node_modules/@effect/cli/dist/esm/internal/prompt/text.js
function getValue(state, options) {
	return state.value.length > 0 ? state.value : options.default;
}
const renderBeep$1 = /*#__PURE__*/ render$1(beep, { style: "pretty" });
function renderClearScreen(state, options) {
	return Effect$1.gen(function* () {
		const columns = yield* (yield* Terminal).columns;
		const resetCurrentLine = cat(eraseLine, cursorLeft);
		const clearError = Option$1.match(state.error, {
			onNone: () => empty$3,
			onSome: (error) => cursorDown(lines(error, columns)).pipe(cat(eraseText(`\n${error}`, columns)))
		});
		const inputValue = state.value.length > 0 ? state.value : options.default;
		const clearOutput = eraseText(`? ${options.message} \u203a ${inputValue}`, columns);
		return clearError.pipe(cat(clearOutput), cat(resetCurrentLine), optimize(Deep), render$1({
			style: "pretty",
			options: { lineWidth: columns }
		}));
	});
}
function renderInput(nextState, options, submitted) {
	const text = getValue(nextState, options);
	const annotation = Option$1.match(nextState.error, {
		onNone: () => {
			if (submitted) return white$1;
			if (nextState.value.length === 0) return blackBright;
			return combine(underlined, cyanBright);
		},
		onSome: () => red$1
	});
	switch (options.type) {
		case "hidden": return empty$3;
		case "password": return annotate(text$7("*".repeat(text.length)), annotation);
		case "text": return annotate(text$7(text), annotation);
	}
}
function renderError(nextState, pointer) {
	return Option$1.match(nextState.error, {
		onNone: () => empty$3,
		onSome: (error) => Arr.match(error.split(/\r?\n/), {
			onEmpty: () => empty$3,
			onNonEmpty: (errorLines) => {
				const annotateLine = (line) => text$7(line).pipe(annotate(combine(italicized, red$1)));
				const prefix = cat(annotate(pointer, red$1), space$1);
				const lines = Arr.map(errorLines, (str) => annotateLine(str));
				return cursorSavePosition.pipe(cat(hardLine), cat(prefix), cat(align(vsep(lines))), cat(cursorRestorePosition));
			}
		})
	});
}
function renderOutput$1(nextState, leadingSymbol, trailingSymbol, options, submitted = false) {
	const annotateLine = (line) => annotate(text$7(line), bold);
	const promptLines = options.message.split(/\r?\n/);
	const prefix = cat(leadingSymbol, space$1);
	if (Arr.isNonEmptyReadonlyArray(promptLines)) {
		const lines = Arr.map(promptLines, (line) => annotateLine(line));
		return prefix.pipe(cat(nest(vsep(lines), 2)), cat(space$1), cat(trailingSymbol), cat(space$1), cat(renderInput(nextState, options, submitted)));
	}
	return hsep([
		prefix,
		trailingSymbol,
		renderInput(nextState, options, submitted)
	]);
}
function renderNextFrame$1(state, options) {
	return Effect$1.gen(function* () {
		const columns = yield* (yield* Terminal).columns;
		const figures$3 = yield* figures;
		const promptMsg = renderOutput$1(state, annotate(text$7("?"), cyanBright), annotate(figures$3.pointerSmall, blackBright), options);
		const errorMsg = renderError(state, figures$3.pointerSmall);
		const offset = state.cursor - state.value.length;
		return promptMsg.pipe(cat(errorMsg), cat(cursorMove(offset)), optimize(Deep), render$1({
			style: "pretty",
			options: { lineWidth: columns }
		}));
	});
}
function renderSubmission$1(state, options) {
	return Effect$1.gen(function* () {
		const columns = yield* (yield* Terminal).columns;
		const figures$4 = yield* figures;
		return renderOutput$1(state, annotate(figures$4.tick, green), annotate(figures$4.ellipsis, blackBright), options, true).pipe(cat(hardLine), optimize(Deep), render$1({
			style: "pretty",
			options: { lineWidth: columns }
		}));
	});
}
function processBackspace(state) {
	if (state.cursor <= 0) return Effect$1.succeed(Action.Beep());
	const beforeCursor = state.value.slice(0, state.cursor - 1);
	const afterCursor = state.value.slice(state.cursor);
	const cursor = state.cursor - 1;
	const value = `${beforeCursor}${afterCursor}`;
	return Effect$1.succeed(Action.NextFrame({ state: {
		...state,
		cursor,
		value,
		error: Option$1.none()
	} }));
}
function processCursorLeft(state) {
	if (state.cursor <= 0) return Effect$1.succeed(Action.Beep());
	const cursor = state.cursor - 1;
	return Effect$1.succeed(Action.NextFrame({ state: {
		...state,
		cursor,
		error: Option$1.none()
	} }));
}
function processCursorRight(state) {
	if (state.cursor >= state.value.length) return Effect$1.succeed(Action.Beep());
	const cursor = Math.min(state.cursor + 1, state.value.length);
	return Effect$1.succeed(Action.NextFrame({ state: {
		...state,
		cursor,
		error: Option$1.none()
	} }));
}
function processTab(state, options) {
	if (state.value === options.default) return Effect$1.succeed(Action.Beep());
	const value = getValue(state, options);
	const cursor = value.length;
	return Effect$1.succeed(Action.NextFrame({ state: {
		...state,
		value,
		cursor,
		error: Option$1.none()
	} }));
}
function defaultProcessor(input, state) {
	const value = `${state.value.slice(0, state.cursor)}${input}${state.value.slice(state.cursor)}`;
	const cursor = state.cursor + input.length;
	return Effect$1.succeed(Action.NextFrame({ state: {
		...state,
		cursor,
		value,
		error: Option$1.none()
	} }));
}
const initialState = {
	cursor: 0,
	value: "",
	error: /*#__PURE__*/ Option$1.none()
};
function handleRender$1(options) {
	return (state, action) => {
		return Action.$match(action, {
			Beep: () => Effect$1.succeed(renderBeep$1),
			NextFrame: ({ state }) => renderNextFrame$1(state, options),
			Submit: () => renderSubmission$1(state, options)
		});
	};
}
function handleProcess$1(options) {
	return (input, state) => {
		switch (input.key.name) {
			case "backspace": return processBackspace(state);
			case "left": return processCursorLeft(state);
			case "right": return processCursorRight(state);
			case "enter":
			case "return": {
				const value = getValue(state, options);
				return Effect$1.match(options.validate(value), {
					onFailure: (error) => Action.NextFrame({ state: {
						...state,
						value,
						error: Option$1.some(error)
					} }),
					onSuccess: (value) => Action.Submit({ value })
				});
			}
			case "tab": return processTab(state, options);
			default: return defaultProcessor(Option$1.getOrElse(input.input, () => ""), state);
		}
	};
}
function handleClear$1(options) {
	return (state, _) => {
		return renderClearScreen(state, options);
	};
}
function basePrompt(options, type) {
	const opts = {
		default: "",
		type,
		validate: Effect$1.succeed,
		...options
	};
	return custom(initialState, {
		render: handleRender$1(opts),
		process: handleProcess$1(opts),
		clear: handleClear$1(opts)
	});
}
/** @internal */
const hidden = (options) => basePrompt(options, "hidden").pipe(map$3(Redacted.make));
/** @internal */
const text$5 = (options) => basePrompt(options, "text");
//#endregion
//#region ../../node_modules/.bun/@effect+cli@0.77.2+74e017304edf4bf0/node_modules/@effect/cli/dist/esm/internal/prompt/toggle.js
const renderBeep = /*#__PURE__*/ render$1(beep, { style: "pretty" });
function handleClear(options) {
	return Effect$1.gen(function* () {
		const columns = yield* (yield* Terminal).columns;
		const clearPrompt = cat(eraseLine, cursorLeft);
		return eraseText(options.message, columns).pipe(cat(clearPrompt), optimize(Deep), render$1({
			style: "pretty",
			options: { lineWidth: columns }
		}));
	});
}
function renderToggle(value, options, submitted = false) {
	const separator = annotate(char("/"), blackBright);
	const selectedAnnotation = combine(underlined, submitted ? white$1 : cyanBright);
	const inactive = value ? text$7(options.inactive) : annotate(text$7(options.inactive), selectedAnnotation);
	const active = value ? annotate(text$7(options.active), selectedAnnotation) : text$7(options.active);
	return hsep([
		active,
		separator,
		inactive
	]);
}
function renderOutput(toggle, leadingSymbol, trailingSymbol, options) {
	const annotateLine = (line) => annotate(text$7(line), bold);
	const promptLines = options.message.split(/\r?\n/);
	const prefix = cat(leadingSymbol, space$1);
	if (Arr.isNonEmptyReadonlyArray(promptLines)) {
		const lines = Arr.map(promptLines, (line) => annotateLine(line));
		return prefix.pipe(cat(nest(vsep(lines), 2)), cat(space$1), cat(trailingSymbol), cat(space$1), cat(toggle));
	}
	return hsep([
		prefix,
		trailingSymbol,
		toggle
	]);
}
function renderNextFrame(state, options) {
	return Effect$1.gen(function* () {
		const terminal = yield* Terminal;
		const figures$1 = yield* figures;
		const columns = yield* terminal.columns;
		const leadingSymbol = annotate(text$7("?"), cyanBright);
		const trailingSymbol = annotate(figures$1.pointerSmall, blackBright);
		const promptMsg = renderOutput(renderToggle(state, options), leadingSymbol, trailingSymbol, options);
		return cursorHide.pipe(cat(promptMsg), optimize(Deep), render$1({
			style: "pretty",
			options: { lineWidth: columns }
		}));
	});
}
function renderSubmission(value, options) {
	return Effect$1.gen(function* () {
		const terminal = yield* Terminal;
		const figures$2 = yield* figures;
		const columns = yield* terminal.columns;
		const leadingSymbol = annotate(figures$2.tick, green);
		const trailingSymbol = annotate(figures$2.ellipsis, blackBright);
		return renderOutput(renderToggle(value, options, true), leadingSymbol, trailingSymbol, options).pipe(cat(hardLine), optimize(Deep), render$1({
			style: "pretty",
			options: { lineWidth: columns }
		}));
	});
}
const activate = /*#__PURE__*/ Effect$1.succeed(/*#__PURE__*/ Action.NextFrame({ state: true }));
const deactivate = /*#__PURE__*/ Effect$1.succeed(/*#__PURE__*/ Action.NextFrame({ state: false }));
function handleRender(options) {
	return (state, action) => {
		switch (action._tag) {
			case "Beep": return Effect$1.succeed(renderBeep);
			case "NextFrame": return renderNextFrame(state, options);
			case "Submit": return renderSubmission(state, options);
		}
	};
}
function handleProcess(input, state) {
	switch (input.key.name) {
		case "0":
		case "j":
		case "delete":
		case "right":
		case "down": return deactivate;
		case "1":
		case "k":
		case "left":
		case "up": return activate;
		case " ":
		case "tab": return state ? deactivate : activate;
		case "enter":
		case "return": return Effect$1.succeed(Action.Submit({ value: state }));
		default: return Effect$1.succeed(Action.Beep());
	}
}
/** @internal */
const toggle = (options) => {
	const opts = {
		initial: false,
		active: "on",
		inactive: "off",
		...options
	};
	return custom(opts.initial, {
		render: handleRender(opts),
		process: handleProcess,
		clear: () => handleClear(opts)
	});
};
/** @internal */
const PrimitiveTypeId = /*#__PURE__*/ Symbol.for("@effect/cli/Primitive");
const proto$5 = {
	[PrimitiveTypeId]: { _A: (_) => _ },
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const isPrimitive = (u) => typeof u === "object" && u != null && PrimitiveTypeId in u;
/** @internal */
const isBool = (self) => isPrimitive(self) && isBoolType(self);
/** @internal */
const isBoolType = (self) => self._tag === "Bool";
/** @internal */
const trueValues = /*#__PURE__*/ Schema.Literal("true", "1", "y", "yes", "on");
/** @internal */
const isTrueValue = /*#__PURE__*/ Schema.is(trueValues);
/** @internal */
const falseValues = /*#__PURE__*/ Schema.Literal("false", "0", "n", "no", "off");
/** @internal */
const isFalseValue = /*#__PURE__*/ Schema.is(falseValues);
/** @internal */
const boolean$2 = (defaultValue) => {
	const op = Object.create(proto$5);
	op._tag = "Bool";
	op.defaultValue = defaultValue;
	return op;
};
/** @internal */
const choice = (alternatives) => {
	const op = Object.create(proto$5);
	op._tag = "Choice";
	op.alternatives = alternatives;
	return op;
};
/** @internal */
const text$4 = /*#__PURE__*/ (() => {
	const op = /*#__PURE__*/ Object.create(proto$5);
	op._tag = "Text";
	return op;
})();
/** @internal */
const getChoices = (self) => getChoicesInternal(self);
/** @internal */
const getHelp$4 = (self) => getHelpInternal$3(self);
/** @internal */
const getTypeName = (self) => getTypeNameInternal(self);
/** @internal */
const validate$1 = /*#__PURE__*/ dual(3, (self, value, config) => validateInternal$1(self, value, config));
/** @internal */
const wizard$3 = /*#__PURE__*/ dual(2, (self, help) => wizardInternal$3(self, help));
const getChoicesInternal = (self) => {
	switch (self._tag) {
		case "Bool": return Option$1.some("true | false");
		case "Choice": {
			const choices = pipe(Arr.map(self.alternatives, ([choice]) => choice), Arr.join(" | "));
			return Option$1.some(choices);
		}
		case "DateTime": return Option$1.some("date");
		case "Float":
		case "Integer":
		case "Path":
		case "Redacted":
		case "Secret":
		case "Text": return Option$1.none();
	}
};
const getHelpInternal$3 = (self) => {
	switch (self._tag) {
		case "Bool": return text$6("A true or false value.");
		case "Choice": {
			const choices = pipe(Arr.map(self.alternatives, ([choice]) => choice), Arr.join(", "));
			return text$6(`One of the following: ${choices}`);
		}
		case "DateTime": return text$6("A date without a time-zone in the ISO-8601 format, such as 2007-12-03T10:15:30.");
		case "Float": return text$6("A floating point number.");
		case "Integer": return text$6("An integer.");
		case "Path":
			if (self.pathType === "either" && self.pathExists === "yes") return text$6("An existing file or directory.");
			if (self.pathType === "file" && self.pathExists === "yes") return text$6("An existing file.");
			if (self.pathType === "directory" && self.pathExists === "yes") return text$6("An existing directory.");
			if (self.pathType === "either" && self.pathExists === "no") return text$6("A file or directory that must not exist.");
			if (self.pathType === "file" && self.pathExists === "no") return text$6("A file that must not exist.");
			if (self.pathType === "directory" && self.pathExists === "no") return text$6("A directory that must not exist.");
			if (self.pathType === "either" && self.pathExists === "either") return text$6("A file or directory.");
			if (self.pathType === "file" && self.pathExists === "either") return text$6("A file.");
			if (self.pathType === "directory" && self.pathExists === "either") return text$6("A directory.");
			throw new Error(`[BUG]: Path.help - encountered invalid combination of path type ('${self.pathType}') and path existence ('${self.pathExists}')`);
		case "Secret":
		case "Redacted": return text$6("A user-defined piece of text that is confidential.");
		case "Text": return text$6("A user-defined piece of text.");
	}
};
const getTypeNameInternal = (self) => {
	switch (self._tag) {
		case "Bool": return "boolean";
		case "Choice": return "choice";
		case "DateTime": return "date";
		case "Float": return "float";
		case "Integer": return "integer";
		case "Path":
			if (self.pathType === "either") return "path";
			return self.pathType;
		case "Redacted": return "redacted";
		case "Secret": return "secret";
		case "Text": return "text";
	}
};
const validateInternal$1 = (self, value, config) => {
	switch (self._tag) {
		case "Bool": return Option$1.map(value, (str) => normalizeCase(config, str)).pipe(Option$1.match({
			onNone: () => Effect$1.orElseFail(self.defaultValue, () => `Missing default value for boolean parameter`),
			onSome: (value) => isTrueValue(value) ? Effect$1.succeed(true) : isFalseValue(value) ? Effect$1.succeed(false) : Effect$1.fail(`Unable to recognize '${value}' as a valid boolean`)
		}));
		case "Choice": return Effect$1.orElseFail(value, () => `Choice options to not have a default value`).pipe(Effect$1.flatMap((value) => Arr.findFirst(self.alternatives, ([choice]) => choice === value)), Effect$1.mapBoth({
			onFailure: () => {
				return `Expected one of the following cases: ${pipe(Arr.map(self.alternatives, ([choice]) => choice), Arr.join(", "))}`;
			},
			onSuccess: ([, value]) => value
		}));
		case "DateTime": return attempt(value, getTypeNameInternal(self), Schema.decodeUnknown(Schema.Date));
		case "Float": return attempt(value, getTypeNameInternal(self), Schema.decodeUnknown(Schema.NumberFromString));
		case "Integer": {
			const intFromString = Schema.compose(Schema.NumberFromString, Schema.Int);
			return attempt(value, getTypeNameInternal(self), Schema.decodeUnknown(intFromString));
		}
		case "Path": return Effect$1.flatMap(FileSystem, (fileSystem) => {
			const errorMsg = "Path options do not have a default value";
			return Effect$1.orElseFail(value, () => errorMsg).pipe(Effect$1.tap((path) => Effect$1.orDie(fileSystem.exists(path)).pipe(Effect$1.tap((pathExists) => validatePathExistence(path, self.pathExists, pathExists).pipe(Effect$1.zipRight(validatePathType(path, self.pathType, fileSystem).pipe(Effect$1.when(() => self.pathExists !== "no" && pathExists))))))));
		});
		case "Redacted": return attempt(value, getTypeNameInternal(self), Schema.decodeUnknown(Schema.String)).pipe(Effect$1.map((value) => Redacted.make(value)));
		case "Secret": return attempt(value, getTypeNameInternal(self), Schema.decodeUnknown(Schema.String)).pipe(Effect$1.map((value) => EffectSecret.fromString(value)));
		case "Text": return attempt(value, getTypeNameInternal(self), Schema.decodeUnknown(Schema.String));
	}
};
const attempt = (option, typeName, parse) => Effect$1.orElseFail(option, () => `${typeName} options do not have a default value`).pipe(Effect$1.flatMap((value) => Effect$1.orElseFail(parse(value), () => `'${value}' is not a ${typeName}`)));
const validatePathExistence = (path, shouldPathExist, pathExists) => {
	if (shouldPathExist === "no" && pathExists) return Effect$1.fail(`Path '${path}' must not exist`);
	if (shouldPathExist === "yes" && !pathExists) return Effect$1.fail(`Path '${path}' must exist`);
	return Effect$1.void;
};
const validatePathType = (path, pathType, fileSystem) => {
	switch (pathType) {
		case "file": {
			const checkIsFile = fileSystem.stat(path).pipe(Effect$1.map((info) => info.type === "File"), Effect$1.orDie);
			return Effect$1.fail(`Expected path '${path}' to be a regular file`).pipe(Effect$1.unlessEffect(checkIsFile), Effect$1.asVoid);
		}
		case "directory": {
			const checkIsDirectory = fileSystem.stat(path).pipe(Effect$1.map((info) => info.type === "Directory"), Effect$1.orDie);
			return Effect$1.fail(`Expected path '${path}' to be a directory`).pipe(Effect$1.unlessEffect(checkIsDirectory), Effect$1.asVoid);
		}
		case "either": return Effect$1.void;
	}
};
const wizardInternal$3 = (self, help) => {
	switch (self._tag) {
		case "Bool": {
			const primitiveHelp = p("Select true or false");
			const message = sequence(help, primitiveHelp);
			const initial = Option$1.getOrElse(self.defaultValue, () => false);
			return toggle({
				message: toAnsiText(message).trimEnd(),
				initial,
				active: "true",
				inactive: "false"
			}).pipe(map$3((bool) => `${bool}`));
		}
		case "Choice": {
			const primitiveHelp = p("Select one of the following choices");
			const message = sequence(help, primitiveHelp);
			return select({
				message: toAnsiText(message).trimEnd(),
				choices: Arr.map(self.alternatives, ([title]) => ({
					title,
					value: title
				}))
			});
		}
		case "DateTime": {
			const primitiveHelp = p("Enter a date");
			const message = sequence(help, primitiveHelp);
			return date({ message: toAnsiText(message).trimEnd() }).pipe(map$3((date) => date.toISOString()));
		}
		case "Float": {
			const primitiveHelp = p("Enter a floating point value");
			const message = sequence(help, primitiveHelp);
			return float({ message: toAnsiText(message).trimEnd() }).pipe(map$3((value) => `${value}`));
		}
		case "Integer": {
			const primitiveHelp = p("Enter an integer");
			const message = sequence(help, primitiveHelp);
			return integer({ message: toAnsiText(message).trimEnd() }).pipe(map$3((value) => `${value}`));
		}
		case "Path": {
			const primitiveHelp = p("Select a file system path");
			const message = sequence(help, primitiveHelp);
			return file({
				type: self.pathType,
				message: toAnsiText(message).trimEnd()
			});
		}
		case "Redacted": {
			const primitiveHelp = p("Enter some text (value will be redacted)");
			const message = sequence(help, primitiveHelp);
			return hidden({ message: toAnsiText(message).trimEnd() });
		}
		case "Secret": {
			const primitiveHelp = p("Enter some text (value will be redacted)");
			const message = sequence(help, primitiveHelp);
			return hidden({ message: toAnsiText(message).trimEnd() });
		}
		case "Text": {
			const primitiveHelp = p("Enter some text");
			const message = sequence(help, primitiveHelp);
			return text$5({ message: toAnsiText(message).trimEnd() });
		}
	}
};
/** @internal */
const getBashCompletions$2 = (self) => {
	switch (self._tag) {
		case "Bool": return "\"${cur}\"";
		case "DateTime":
		case "Float":
		case "Integer":
		case "Secret":
		case "Redacted":
		case "Text": return "$(compgen -f \"${cur}\")";
		case "Path": switch (self.pathType) {
			case "file": return self.pathExists === "yes" || self.pathExists === "either" ? "$(compgen -f \"${cur}\")" : "";
			case "directory": return self.pathExists === "yes" || self.pathExists === "either" ? "$(compgen -d \"${cur}\")" : "";
			case "either": return self.pathExists === "yes" || self.pathExists === "either" ? "$(compgen -f \"${cur}\")" : "";
		}
		case "Choice": return `$(compgen -W "${pipe(Arr.map(self.alternatives, ([choice]) => choice), Arr.join(","))}" -- "\${cur}")`;
	}
};
/** @internal */
const getFishCompletions$3 = (self) => {
	switch (self._tag) {
		case "Bool": return Arr.empty();
		case "DateTime":
		case "Float":
		case "Integer":
		case "Redacted":
		case "Secret":
		case "Text": return Arr.make("-r", "-f");
		case "Path": switch (self.pathType) {
			case "file": return self.pathExists === "yes" || self.pathExists === "either" ? Arr.make("-r", "-F") : Arr.make("-r");
			case "directory": return self.pathExists === "yes" || self.pathExists === "either" ? Arr.make("-r", "-f", "-a", `"(__fish_complete_directories (commandline -ct))"`) : Arr.make("-r");
			case "either": return self.pathExists === "yes" || self.pathExists === "either" ? Arr.make("-r", "-F") : Arr.make("-r");
		}
		case "Choice": {
			const choices = pipe(Arr.map(self.alternatives, ([choice]) => `${choice}''`), Arr.join(","));
			return Arr.make("-r", "-f", "-a", `"{${choices}}"`);
		}
	}
};
/** @internal */
const getZshCompletions$3 = (self) => {
	switch (self._tag) {
		case "Bool": return "";
		case "Choice": return `:CHOICE:(${pipe(Arr.map(self.alternatives, ([name]) => name), Arr.join(" "))})`;
		case "DateTime": return "";
		case "Float": return "";
		case "Integer": return "";
		case "Path": switch (self.pathType) {
			case "file": return self.pathExists === "yes" || self.pathExists === "either" ? ":PATH:_files" : "";
			case "directory": return self.pathExists === "yes" || self.pathExists === "either" ? ":PATH:_files -/" : "";
			case "either": return self.pathExists === "yes" || self.pathExists === "either" ? ":PATH:_files" : "";
		}
		case "Redacted":
		case "Secret":
		case "Text": return "";
	}
};
//#endregion
//#region ../../node_modules/.bun/@effect+cli@0.77.2+74e017304edf4bf0/node_modules/@effect/cli/dist/esm/internal/usage.js
/** @internal */
const empty = { _tag: "Empty" };
/** @internal */
const mixed = { _tag: "Empty" };
/** @internal */
const named = (names, acceptedValues) => ({
	_tag: "Named",
	names,
	acceptedValues
});
/** @internal */
const optional$2 = (self) => ({
	_tag: "Optional",
	usage: self
});
/** @internal */
const repeated$4 = (self) => ({
	_tag: "Repeated",
	usage: self
});
const alternation = /*#__PURE__*/ dual(2, (self, that) => ({
	_tag: "Alternation",
	left: self,
	right: that
}));
/** @internal */
const concat = /*#__PURE__*/ dual(2, (self, that) => ({
	_tag: "Concat",
	left: self,
	right: that
}));
/** @internal */
const getHelp$3 = (self) => {
	const spans = enumerate(self, defaultConfig);
	if (Arr.isNonEmptyReadonlyArray(spans)) {
		const head = Arr.headNonEmpty(spans);
		const tail = Arr.tailNonEmpty(spans);
		if (Arr.isNonEmptyReadonlyArray(tail)) return pipe(Arr.map(spans, (span) => p(span)), Arr.reduceRight(empty$1, (left, right) => sequence(left, right)));
		return p(head);
	}
	return empty$1;
};
/** @internal */
const enumerate = /*#__PURE__*/ dual(2, (self, config) => render(simplify(self, config), config));
const simplify = (self, config) => {
	switch (self._tag) {
		case "Empty": return empty;
		case "Mixed": return mixed;
		case "Named":
			if (Option$1.isNone(Arr.head(render(self, config)))) return empty;
			return self;
		case "Optional": {
			if (self.usage._tag === "Empty") return empty;
			const usage = simplify(self.usage, config);
			return usage._tag === "Empty" ? empty : usage._tag === "Optional" ? usage : optional$2(usage);
		}
		case "Repeated": {
			const usage = simplify(self.usage, config);
			return usage._tag === "Empty" ? empty : repeated$4(usage);
		}
		case "Alternation": {
			const leftUsage = simplify(self.left, config);
			const rightUsage = simplify(self.right, config);
			return leftUsage._tag === "Empty" ? rightUsage : rightUsage._tag === "Empty" ? leftUsage : alternation(leftUsage, rightUsage);
		}
		case "Concat": {
			const leftUsage = simplify(self.left, config);
			const rightUsage = simplify(self.right, config);
			return leftUsage._tag === "Empty" ? rightUsage : rightUsage._tag === "Empty" ? leftUsage : concat(leftUsage, rightUsage);
		}
	}
};
const render = (self, config) => {
	switch (self._tag) {
		case "Empty": return Arr.of(text$6(""));
		case "Mixed": return Arr.of(text$6("<command>"));
		case "Named": {
			const typeInfo = config.showTypes ? Option$1.match(self.acceptedValues, {
				onNone: () => empty$2,
				onSome: (s) => concat$1(space, text$6(s))
			}) : empty$2;
			const namesToShow = config.showAllNames ? self.names : self.names.length > 1 ? pipe(Arr.filter(self.names, (name) => name.startsWith("--")), Arr.head, Option$1.map(Arr.of), Option$1.getOrElse(() => self.names)) : self.names;
			const nameInfo = text$6(Arr.join(namesToShow, ", "));
			return config.showAllNames && self.names.length > 1 ? Arr.of(spans([
				text$6("("),
				nameInfo,
				typeInfo,
				text$6(")")
			])) : Arr.of(concat$1(nameInfo, typeInfo));
		}
		case "Optional": return Arr.map(render(self.usage, config), (span) => spans([
			text$6("["),
			span,
			text$6("]")
		]));
		case "Repeated": return Arr.map(render(self.usage, config), (span) => concat$1(span, text$6("...")));
		case "Alternation":
			if (self.left._tag === "Repeated" || self.right._tag === "Repeated" || self.left._tag === "Concat" || self.right._tag === "Concat") return Arr.appendAll(render(self.left, config), render(self.right, config));
			return Arr.flatMap(render(self.left, config), (left) => Arr.map(render(self.right, config), (right) => spans([
				left,
				text$6("|"),
				right
			])));
		case "Concat": {
			const leftSpan = render(self.left, config);
			const rightSpan = render(self.right, config);
			const separator = Arr.isNonEmptyReadonlyArray(leftSpan) && Arr.isNonEmptyReadonlyArray(rightSpan) ? space : empty$2;
			return Arr.flatMap(leftSpan, (left) => Arr.map(rightSpan, (right) => spans([
				left,
				separator,
				right
			])));
		}
	}
};
/** @internal */
const ValidationErrorTypeId = /*#__PURE__*/ Symbol.for("@effect/cli/ValidationError");
/** @internal */
const proto$4 = { [ValidationErrorTypeId]: ValidationErrorTypeId };
/** @internal */
const isValidationError = (u) => typeof u === "object" && u != null && ValidationErrorTypeId in u;
/** @internal */
const isCommandMismatch = (self) => self._tag === "CommandMismatch";
/** @internal */
const isHelpRequested = (self) => self._tag === "HelpRequested";
/** @internal */
const isMultipleValuesDetected = (self) => self._tag === "MultipleValuesDetected";
/** @internal */
const isMissingValue = (self) => self._tag === "MissingValue";
/** @internal */
const commandMismatch = (error) => {
	const op = Object.create(proto$4);
	op._tag = "CommandMismatch";
	op.error = error;
	return op;
};
/** @internal */
const correctedFlag = (error) => {
	const op = Object.create(proto$4);
	op._tag = "CorrectedFlag";
	op.error = error;
	return op;
};
/** @internal */
const invalidArgument = (error) => {
	const op = Object.create(proto$4);
	op._tag = "InvalidArgument";
	op.error = error;
	return op;
};
/** @internal */
const invalidValue = (error) => {
	const op = Object.create(proto$4);
	op._tag = "InvalidValue";
	op.error = error;
	return op;
};
/** @internal */
const missingFlag = (error) => {
	const op = Object.create(proto$4);
	op._tag = "MissingFlag";
	op.error = error;
	return op;
};
/** @internal */
const missingValue = (error) => {
	const op = Object.create(proto$4);
	op._tag = "MissingValue";
	op.error = error;
	return op;
};
/** @internal */
const multipleValuesDetected = (error, values) => {
	const op = Object.create(proto$4);
	op._tag = "MultipleValuesDetected";
	op.error = error;
	op.values = values;
	return op;
};
/** @internal */
const noBuiltInMatch = (error) => {
	const op = Object.create(proto$4);
	op._tag = "NoBuiltInMatch";
	op.error = error;
	return op;
};
/** @internal */
const unclusteredFlag = (error, unclustered, rest) => {
	const op = Object.create(proto$4);
	op._tag = "UnclusteredFlag";
	op.error = error;
	op.unclustered = unclustered;
	op.rest = rest;
	return op;
};
/** @internal */
const ArgsTypeId = /*#__PURE__*/ Symbol.for("@effect/cli/Args");
const proto$3 = {
	[ArgsTypeId]: { _A: (_) => _ },
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const isArgs = (u) => typeof u === "object" && u != null && ArgsTypeId in u;
/** @internal */
const isEmpty$1 = (self) => self._tag === "Empty";
/** @internal */
const all$2 = function() {
	if (arguments.length === 1) {
		if (isArgs(arguments[0])) return map$2(arguments[0], (x) => [x]);
		else if (Arr.isArray(arguments[0])) return allTupled$1(arguments[0]);
		else {
			const entries = Object.entries(arguments[0]);
			let result = map$2(entries[0][1], (value) => ({ [entries[0][0]]: value }));
			if (entries.length === 1) return result;
			const rest = entries.slice(1);
			for (const [key, options] of rest) result = map$2(makeBoth$1(result, options), ([record, value]) => ({
				...record,
				[key]: value
			}));
			return result;
		}
	}
	return allTupled$1(arguments[0]);
};
/** @internal */
const none$1 = /*#__PURE__*/ (() => {
	const op = /*#__PURE__*/ Object.create(proto$3);
	op._tag = "Empty";
	return op;
})();
/** @internal */
const text$3 = (config) => makeSingle$1(Option$1.fromNullable(config?.name), text$4);
/** @internal */
const getHelp$2 = (self) => getHelpInternal$2(self);
/** @internal */
const getUsage$2 = (self) => getUsageInternal$2(self);
/** @internal */
const map$2 = /*#__PURE__*/ dual(2, (self, f) => mapEffect$1(self, (a) => Effect$1.succeed(f(a))));
/** @internal */
const mapEffect$1 = /*#__PURE__*/ dual(2, (self, f) => makeMap$1(self, f));
/** @internal */
const repeated$3 = (self) => makeVariadic$1(self, Option$1.none(), Option$1.none());
/** @internal */
const validate = /*#__PURE__*/ dual(3, (self, args, config) => validateInternal(self, args, config));
/** @internal */
const wizard$2 = /*#__PURE__*/ dual(2, (self, config) => wizardInternal$2(self, config));
const allTupled$1 = (arg) => {
	if (arg.length === 0) return none$1;
	if (arg.length === 1) return map$2(arg[0], (x) => [x]);
	let result = map$2(arg[0], (x) => [x]);
	for (let i = 1; i < arg.length; i++) {
		const curr = arg[i];
		result = map$2(makeBoth$1(result, curr), ([a, b]) => [...a, b]);
	}
	return result;
};
const getHelpInternal$2 = (self) => {
	switch (self._tag) {
		case "Empty": return empty$1;
		case "Single": return descriptionList([[weak(self.name), sequence(p(getHelp$4(self.primitiveType)), self.description)]]);
		case "Map": return getHelpInternal$2(self.args);
		case "Both": return sequence(getHelpInternal$2(self.left), getHelpInternal$2(self.right));
		case "Variadic": {
			const help = getHelpInternal$2(self.args);
			return mapDescriptionList(help, (oldSpan, oldBlock) => {
				const min = getMinSizeInternal$1(self);
				const max = getMaxSizeInternal$1(self);
				const newSpan = text$6(Option$1.isSome(self.max) ? ` ${min} - ${max}` : min === 0 ? "..." : ` ${min}+`);
				const newBlock = p(Option$1.isSome(self.max) ? `This argument must be repeated at least ${min} times and may be repeated up to ${max} times.` : min === 0 ? "This argument may be repeated zero or more times." : `This argument must be repeated at least ${min} times.`);
				return [concat$1(oldSpan, newSpan), sequence(oldBlock, newBlock)];
			});
		}
		case "WithDefault": return mapDescriptionList(getHelpInternal$2(self.args), (span, block) => {
			const optionalDescription = Option$1.isOption(self.fallback) ? Option$1.match(self.fallback, {
				onNone: () => p("This setting is optional."),
				onSome: (fallbackValue) => {
					const inspectableValue = Predicate.isObject(fallbackValue) ? fallbackValue : String(fallbackValue);
					const displayValue = Inspectable.toStringUnknown(inspectableValue, 0);
					return p(`This setting is optional. Defaults to: ${displayValue}`);
				}
			}) : p("This setting is optional.");
			return [span, sequence(block, optionalDescription)];
		});
		case "WithFallbackConfig": return mapDescriptionList(getHelpInternal$2(self.args), (span, block) => [span, sequence(block, p("This argument can be set from environment variables."))]);
	}
};
const getMinSizeInternal$1 = (self) => {
	switch (self._tag) {
		case "Empty":
		case "WithDefault":
		case "WithFallbackConfig": return 0;
		case "Single": return 1;
		case "Map": return getMinSizeInternal$1(self.args);
		case "Both": return getMinSizeInternal$1(self.left) + getMinSizeInternal$1(self.right);
		case "Variadic": {
			const argsMinSize = getMinSizeInternal$1(self.args);
			return Math.floor(Option$1.getOrElse(self.min, () => 0) * argsMinSize);
		}
	}
};
const getMaxSizeInternal$1 = (self) => {
	switch (self._tag) {
		case "Empty": return 0;
		case "Single": return 1;
		case "Map":
		case "WithDefault":
		case "WithFallbackConfig": return getMaxSizeInternal$1(self.args);
		case "Both": return getMaxSizeInternal$1(self.left) + getMaxSizeInternal$1(self.right);
		case "Variadic": {
			const argsMaxSize = getMaxSizeInternal$1(self.args);
			return Math.floor(Option$1.getOrElse(self.max, () => Number.MAX_SAFE_INTEGER / 2) * argsMaxSize);
		}
	}
};
const getUsageInternal$2 = (self) => {
	switch (self._tag) {
		case "Empty": return empty;
		case "Single": return named(Arr.of(self.name), getChoices(self.primitiveType));
		case "Map": return getUsageInternal$2(self.args);
		case "Both": return concat(getUsageInternal$2(self.left), getUsageInternal$2(self.right));
		case "Variadic": return repeated$4(getUsageInternal$2(self.args));
		case "WithDefault":
		case "WithFallbackConfig": return optional$2(getUsageInternal$2(self.args));
	}
};
const makeSingle$1 = (pseudoName, primitiveType, description = empty$1) => {
	const op = Object.create(proto$3);
	op._tag = "Single";
	op.name = `<${Option$1.getOrElse(pseudoName, () => getTypeName(primitiveType))}>`;
	op.pseudoName = pseudoName;
	op.primitiveType = primitiveType;
	op.description = description;
	return op;
};
const makeMap$1 = (self, f) => {
	const op = Object.create(proto$3);
	op._tag = "Map";
	op.args = self;
	op.f = f;
	return op;
};
const makeBoth$1 = (left, right) => {
	const op = Object.create(proto$3);
	op._tag = "Both";
	op.left = left;
	op.right = right;
	return op;
};
const makeVariadic$1 = (args, min, max) => {
	const op = Object.create(proto$3);
	op._tag = "Variadic";
	op.args = args;
	op.min = min;
	op.max = max;
	return op;
};
const validateInternal = (self, args, config) => {
	switch (self._tag) {
		case "Empty": return Effect$1.succeed([args, void 0]);
		case "Single": return Effect$1.suspend(() => {
			return Arr.matchLeft(args, {
				onEmpty: () => {
					const choices = getChoices(self.primitiveType);
					if (Option$1.isSome(self.pseudoName) && Option$1.isSome(choices)) return Effect$1.fail(missingValue(p(`Missing argument <${self.pseudoName.value}> with choices ${choices.value}`)));
					if (Option$1.isSome(self.pseudoName)) return Effect$1.fail(missingValue(p(`Missing argument <${self.pseudoName.value}>`)));
					if (Option$1.isSome(choices)) return Effect$1.fail(missingValue(p(`Missing argument ${getTypeName(self.primitiveType)} with choices ${choices.value}`)));
					return Effect$1.fail(missingValue(p(`Missing argument ${getTypeName(self.primitiveType)}`)));
				},
				onNonEmpty: (head, tail) => validate$1(self.primitiveType, Option$1.some(head), config).pipe(Effect$1.mapBoth({
					onFailure: (text) => invalidArgument(p(text)),
					onSuccess: (a) => [tail, a]
				}))
			});
		});
		case "Map": return validateInternal(self.args, args, config).pipe(Effect$1.flatMap(([leftover, a]) => Effect$1.matchEffect(self.f(a), {
			onFailure: (doc) => Effect$1.fail(invalidArgument(doc)),
			onSuccess: (b) => Effect$1.succeed([leftover, b])
		})));
		case "Both": return validateInternal(self.left, args, config).pipe(Effect$1.flatMap(([args, a]) => validateInternal(self.right, args, config).pipe(Effect$1.map(([args, b]) => [args, [a, b]]))));
		case "Variadic": {
			const min1 = Option$1.getOrElse(self.min, () => 0);
			const max1 = Option$1.getOrElse(self.max, () => Number.MAX_SAFE_INTEGER);
			const loop = (args, acc) => {
				if (acc.length >= max1) return Effect$1.succeed([args, acc]);
				return validateInternal(self.args, args, config).pipe(Effect$1.matchEffect({
					onFailure: (failure) => acc.length >= min1 && Arr.isEmptyReadonlyArray(args) ? Effect$1.succeed([args, acc]) : Effect$1.fail(failure),
					onSuccess: ([args, a]) => loop(args, Arr.append(acc, a))
				}));
			};
			return loop(args, Arr.empty()).pipe(Effect$1.map(([args, acc]) => [args, acc]));
		}
		case "WithDefault": return validateInternal(self.args, args, config).pipe(Effect$1.catchTag("MissingValue", () => Effect$1.succeed([args, self.fallback])));
		case "WithFallbackConfig": return validateInternal(self.args, args, config).pipe(Effect$1.catchTag("MissingValue", (e) => Effect$1.map(Effect$1.catchAll(self.config, (e2) => {
			if (ConfigError.isMissingDataOnly(e2)) {
				const help = p(String(e2));
				const error = invalidValue(help);
				return Effect$1.fail(error);
			}
			return Effect$1.fail(e);
		}), (value) => [args, value])));
	}
};
const wizardInternal$2 = (self, config) => {
	switch (self._tag) {
		case "Empty": return Effect$1.succeed(Arr.empty());
		case "Single": {
			const help = getHelpInternal$2(self);
			return wizard$3(self.primitiveType, help).pipe(Effect$1.zipLeft(Console.log()), Effect$1.flatMap((input) => {
				const args = Arr.of(input);
				return validateInternal(self, args, config).pipe(Effect$1.as(args));
			}));
		}
		case "Map": return wizardInternal$2(self.args, config).pipe(Effect$1.tap((args) => validateInternal(self.args, args, config)));
		case "Both": return Effect$1.zipWith(wizardInternal$2(self.left, config), wizardInternal$2(self.right, config), (left, right) => Arr.appendAll(left, right)).pipe(Effect$1.tap((args) => validateInternal(self, args, config)));
		case "Variadic": {
			const repeatHelp = p("How many times should this argument should be repeated?");
			const message = pipe(getHelpInternal$2(self), sequence(repeatHelp));
			return integer({
				message: toAnsiText(message).trimEnd(),
				min: getMinSizeInternal$1(self),
				max: getMaxSizeInternal$1(self)
			}).pipe(Effect$1.zipLeft(Console.log()), Effect$1.flatMap((n) => n <= 0 ? Effect$1.succeed(Arr.empty()) : Ref.make(Arr.empty()).pipe(Effect$1.flatMap((ref) => wizardInternal$2(self.args, config).pipe(Effect$1.flatMap((args) => Ref.update(ref, Arr.appendAll(args))), Effect$1.repeatN(n - 1), Effect$1.zipRight(Ref.get(ref)), Effect$1.tap((args) => validateInternal(self, args, config)))))));
		}
		case "WithDefault": {
			const defaultHelp = p(`This argument is optional - use the default?`);
			const message = pipe(getHelpInternal$2(self.args), sequence(defaultHelp));
			return select({
				message: toAnsiText(message).trimEnd(),
				choices: [{
					title: `Default ['${JSON.stringify(self.fallback)}']`,
					value: true
				}, {
					title: "Custom",
					value: false
				}]
			}).pipe(Effect$1.zipLeft(Console.log()), Effect$1.flatMap((useFallback) => useFallback ? Effect$1.succeed(Arr.empty()) : wizardInternal$2(self.args, config)));
		}
		case "WithFallbackConfig": {
			const defaultHelp = p(`Try load this option from the environment?`);
			const message = pipe(getHelpInternal$2(self.args), sequence(defaultHelp));
			return select({
				message: toAnsiText(message).trimEnd(),
				choices: [{
					title: `Use environment variables`,
					value: true
				}, {
					title: "Custom",
					value: false
				}]
			}).pipe(Effect$1.zipLeft(Console.log()), Effect$1.flatMap((useFallback) => useFallback ? Effect$1.succeed(Arr.empty()) : wizardInternal$2(self.args, config)));
		}
	}
};
const getShortDescription$2 = (self) => {
	switch (self._tag) {
		case "Empty":
		case "Both": return "";
		case "Single": return getText(getSpan(self.description));
		case "Map":
		case "Variadic":
		case "WithDefault":
		case "WithFallbackConfig": return getShortDescription$2(self.args);
	}
};
/** @internal */
const getFishCompletions$2 = (self) => {
	switch (self._tag) {
		case "Empty": return Arr.empty();
		case "Single": {
			const description = getShortDescription$2(self);
			return pipe(getFishCompletions$3(self.primitiveType), Arr.appendAll(description.length === 0 ? Arr.empty() : Arr.of(`-d '${escapeSingleQuoted(description)}'`)), Arr.join(" "), Arr.of);
		}
		case "Both": return pipe(getFishCompletions$2(self.left), Arr.appendAll(getFishCompletions$2(self.right)));
		case "Map":
		case "Variadic":
		case "WithDefault":
		case "WithFallbackConfig": return getFishCompletions$2(self.args);
	}
};
const getZshCompletions$2 = (self, state = {
	multiple: false,
	optional: false
}) => {
	switch (self._tag) {
		case "Empty": return Arr.empty();
		case "Single": {
			const multiple = state.multiple ? "*" : "";
			const optional = state.optional ? "::" : ":";
			const shortDescription = getShortDescription$2(self);
			const description = shortDescription.length > 0 ? ` -- ${escapeSingleQuoted(shortDescription)}` : "";
			const possibleValues = getZshCompletions$3(self.primitiveType);
			return possibleValues.length === 0 ? Arr.empty() : Arr.of(`${multiple}${optional}${self.name}${description}${possibleValues}`);
		}
		case "Map": return getZshCompletions$2(self.args, state);
		case "Both": {
			const left = getZshCompletions$2(self.left, state);
			const right = getZshCompletions$2(self.right, state);
			return Arr.appendAll(left, right);
		}
		case "Variadic": return Option$1.isSome(self.max) && self.max.value > 1 ? getZshCompletions$2(self.args, {
			...state,
			multiple: true
		}) : getZshCompletions$2(self.args, state);
		case "WithDefault":
		case "WithFallbackConfig": return getZshCompletions$2(self.args, {
			...state,
			optional: true
		});
	}
};
//#endregion
//#region ../../node_modules/.bun/@effect+cli@0.77.2+74e017304edf4bf0/node_modules/@effect/cli/dist/esm/Args.js
/**
* @since 1.0.0
* @category combinators
*/
const repeated$2 = repeated$3;
/**
* Creates a text argument.
*
* Can optionally provide a custom argument name (defaults to `"text"`).
*
* @since 1.0.0
* @category constructors
*/
const text$2 = text$3;
//#endregion
//#region ../../node_modules/.bun/@effect+cli@0.77.2+74e017304edf4bf0/node_modules/@effect/cli/dist/esm/internal/autoCorrect.js
/** @internal */
const levensteinDistance = (first, second, config) => {
	if (first.length === 0 && second.length === 0) return 0;
	if (first.length === 0) return second.length;
	if (second.length === 0) return first.length;
	const rowCount = first.length;
	const columnCount = second.length;
	const matrix = new Array(rowCount);
	const normalFirst = normalizeCase(config, first);
	const normalSecond = normalizeCase(config, second);
	for (let x = 0; x <= rowCount; x++) {
		matrix[x] = new Array(columnCount);
		matrix[x][0] = x;
	}
	for (let y = 0; y <= columnCount; y++) matrix[0][y] = y;
	for (let row = 1; row <= rowCount; row++) for (let col = 1; col <= columnCount; col++) {
		const cost = normalFirst.charAt(row - 1) === normalSecond.charAt(col - 1) ? 0 : 1;
		matrix[row][col] = Math.min(matrix[row][col - 1] + 1, Math.min(matrix[row - 1][col] + 1, matrix[row - 1][col - 1] + cost));
	}
	return matrix[rowCount][columnCount];
};
//#endregion
//#region ../../node_modules/.bun/@effect+cli@0.77.2+74e017304edf4bf0/node_modules/@effect/cli/dist/esm/internal/prompt/list.js
/** @internal */
const list = (options) => text$5(options).pipe(map$3((output) => output.split(options.delimiter || ",")));
/** @internal */
const OptionsTypeId = /*#__PURE__*/ Symbol.for("@effect/cli/Options");
const proto$2 = {
	[OptionsTypeId]: { _A: (_) => _ },
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const isOptions = (u) => typeof u === "object" && u != null && OptionsTypeId in u;
/** @internal */
const isEmpty = (self) => self._tag === "Empty";
/** @internal */
const isSingle = (self) => self._tag === "Single";
/** @internal */
const all$1 = function() {
	if (arguments.length === 1) {
		if (isOptions(arguments[0])) return map$1(arguments[0], (x) => [x]);
		else if (Arr.isArray(arguments[0])) return allTupled(arguments[0]);
		else {
			const entries = Object.entries(arguments[0]);
			let result = map$1(entries[0][1], (value) => ({ [entries[0][0]]: value }));
			if (entries.length === 1) return result;
			const rest = entries.slice(1);
			for (const [key, options] of rest) result = map$1(makeBoth(result, options), ([record, value]) => ({
				...record,
				[key]: value
			}));
			return result;
		}
	}
	return allTupled(arguments[0]);
};
const defaultBooleanOptions = {
	ifPresent: true,
	negationNames: [],
	aliases: []
};
/** @internal */
const boolean$1 = (name, options) => {
	const { aliases, ifPresent, negationNames } = {
		...defaultBooleanOptions,
		...options
	};
	const option = makeSingle(name, aliases, boolean$2(Option$1.some(ifPresent)));
	if (Arr.isNonEmptyReadonlyArray(negationNames)) {
		const head = Arr.headNonEmpty(negationNames);
		const tail = Arr.tailNonEmpty(negationNames);
		const negationOption = makeSingle(head, tail, boolean$2(Option$1.some(!ifPresent)));
		return withDefault(orElse(option, negationOption), !ifPresent);
	}
	return withDefault(option, !ifPresent);
};
/** @internal */
const choiceWithValue = (name, choices) => makeSingle(name, Arr.empty(), choice(choices));
/** @internal */
const none = /*#__PURE__*/ (() => {
	const op = /*#__PURE__*/ Object.create(proto$2);
	op._tag = "Empty";
	return op;
})();
/** @internal */
const text$1 = (name) => makeSingle(name, Arr.empty(), text$4);
/** @internal */
const getHelp$1 = (self) => getHelpInternal$1(self);
/** @internal */
const getUsage$1 = (self) => getUsageInternal$1(self);
/** @internal */
const map$1 = /*#__PURE__*/ dual(2, (self, f) => makeMap(self, (a) => Either$1.right(f(a))));
/** @internal */
const optional$1 = (self) => withDefault(map$1(self, Option$1.some), Option$1.none());
/** @internal */
const orElse = /*#__PURE__*/ dual(2, (self, that) => orElseEither(self, that).pipe(map$1(Either$1.merge)));
/** @internal */
const orElseEither = /*#__PURE__*/ dual(2, (self, that) => makeOrElse(self, that));
/** @internal */
const processCommandLine = /*#__PURE__*/ dual(3, (self, args, config) => matchOptions(args, toParseableInstruction(self), config).pipe(Effect$1.flatMap(([error, commandArgs, matchedOptions]) => parseInternal$1(self, matchedOptions, config).pipe(Effect$1.catchAll((e) => Option$1.match(error, {
	onNone: () => Effect$1.fail(e),
	onSome: (err) => Effect$1.fail(err)
})), Effect$1.map((a) => [
	error,
	commandArgs,
	a
])))));
/** @internal */
const repeated$1 = (self) => makeVariadic(self, Option$1.none(), Option$1.none());
/** @internal */
const withAlias = /*#__PURE__*/ dual(2, (self, alias) => modifySingle(self, (single) => {
	const aliases = Arr.append(single.aliases, alias);
	return makeSingle(single.name, aliases, single.primitiveType, single.description, single.pseudoName);
}));
/** @internal */
const withDefault = /*#__PURE__*/ dual(2, (self, fallback) => makeWithDefault(self, fallback));
/** @internal */
const withDescription = /*#__PURE__*/ dual(2, (self, desc) => modifySingle(self, (single) => {
	const description = sequence(single.description, p(desc));
	return makeSingle(single.name, single.aliases, single.primitiveType, description, single.pseudoName);
}));
/** @internal */
const wizard$1 = /*#__PURE__*/ dual(2, (self, config) => wizardInternal$1(self, config));
const allTupled = (arg) => {
	if (arg.length === 0) return none;
	if (arg.length === 1) return map$1(arg[0], (x) => [x]);
	let result = map$1(arg[0], (x) => [x]);
	for (let i = 1; i < arg.length; i++) {
		const curr = arg[i];
		result = map$1(makeBoth(result, curr), ([a, b]) => [...a, b]);
	}
	return result;
};
const getHelpInternal$1 = (self) => {
	switch (self._tag) {
		case "Empty": return empty$1;
		case "Single": return descriptionList(Arr.of([getSpan(getHelp$3(getUsageInternal$1(self))), sequence(p(getHelp$4(self.primitiveType)), self.description)]));
		case "KeyValueMap": {
			const identifier = Option$1.getOrThrow(getIdentifierInternal(self.argumentOption));
			return mapDescriptionList(getHelpInternal$1(self.argumentOption), (span, oldBlock) => {
				const header = p("This setting is a property argument which:");
				const single = `${identifier} key1=value key2=value2`;
				const multiple = `${identifier} key1=value ${identifier} key2=value2`;
				const description = enumeration([p(`May be specified a single time:  '${single}'`), p(`May be specified multiple times: '${multiple}'`)]);
				return [span, pipe(oldBlock, sequence(header), sequence(description))];
			});
		}
		case "Map": return getHelpInternal$1(self.options);
		case "Both":
		case "OrElse": return sequence(getHelpInternal$1(self.left), getHelpInternal$1(self.right));
		case "Variadic": {
			const help = getHelpInternal$1(self.argumentOption);
			return mapDescriptionList(help, (oldSpan, oldBlock) => {
				const min = getMinSizeInternal(self);
				const max = getMaxSizeInternal(self);
				const newSpan = text$6(Option$1.isSome(self.max) ? ` ${min} - ${max}` : min === 0 ? "..." : ` ${min}+`);
				const newBlock = p(Option$1.isSome(self.max) ? `This option must be repeated at least ${min} times and may be repeated up to ${max} times.` : min === 0 ? "This option may be repeated zero or more times." : `This option must be repeated at least ${min} times.`);
				return [concat$1(oldSpan, newSpan), sequence(oldBlock, newBlock)];
			});
		}
		case "WithDefault": return mapDescriptionList(getHelpInternal$1(self.options), (span, block) => {
			const optionalDescription = Option$1.isOption(self.fallback) ? Option$1.match(self.fallback, {
				onNone: () => p("This setting is optional."),
				onSome: (fallbackValue) => {
					const inspectableValue = Predicate.isObject(fallbackValue) ? fallbackValue : String(fallbackValue);
					const displayValue = Inspectable.toStringUnknown(inspectableValue, 0);
					return p(`This setting is optional. Defaults to: ${displayValue}`);
				}
			}) : p("This setting is optional.");
			return [span, sequence(block, optionalDescription)];
		});
		case "WithFallback": {
			const helpDoc = Config.isConfig(self.effect) ? p("This option can be set from environment variables.") : isPrompt(self.effect) ? p("Will prompt the user for input if this option is not provided.") : empty$1;
			return mapDescriptionList(getHelpInternal$1(self.options), (span, block) => [span, sequence(block, helpDoc)]);
		}
	}
};
const getIdentifierInternal = (self) => {
	switch (self._tag) {
		case "Empty": return Option$1.none();
		case "Single": return Option$1.some(self.fullName);
		case "Both":
		case "OrElse": {
			const ids = Arr.getSomes([getIdentifierInternal(self.left), getIdentifierInternal(self.right)]);
			return Arr.match(ids, {
				onEmpty: () => Option$1.none(),
				onNonEmpty: (ids) => Option$1.some(Arr.join(ids, ", "))
			});
		}
		case "KeyValueMap":
		case "Variadic": return getIdentifierInternal(self.argumentOption);
		case "Map":
		case "WithFallback":
		case "WithDefault": return getIdentifierInternal(self.options);
	}
};
const getMinSizeInternal = (self) => {
	switch (self._tag) {
		case "Empty":
		case "WithDefault":
		case "WithFallback": return 0;
		case "Single":
		case "KeyValueMap": return 1;
		case "Map": return getMinSizeInternal(self.options);
		case "Both": return getMinSizeInternal(self.left) + getMinSizeInternal(self.right);
		case "OrElse": {
			const leftMinSize = getMinSizeInternal(self.left);
			const rightMinSize = getMinSizeInternal(self.right);
			return Math.min(leftMinSize, rightMinSize);
		}
		case "Variadic": return Option$1.getOrElse(self.min, () => 0) * getMinSizeInternal(self.argumentOption);
	}
};
const getMaxSizeInternal = (self) => {
	switch (self._tag) {
		case "Empty": return 0;
		case "Single": return 1;
		case "KeyValueMap": return Number.MAX_SAFE_INTEGER;
		case "Map":
		case "WithDefault":
		case "WithFallback": return getMaxSizeInternal(self.options);
		case "Both": return getMaxSizeInternal(self.left) + getMaxSizeInternal(self.right);
		case "OrElse": {
			const leftMin = getMaxSizeInternal(self.left);
			const rightMin = getMaxSizeInternal(self.right);
			return Math.min(leftMin, rightMin);
		}
		case "Variadic": {
			const selfMaxSize = Option$1.getOrElse(self.max, () => Number.MAX_SAFE_INTEGER / 2);
			const optionsMaxSize = getMaxSizeInternal(self.argumentOption);
			return Math.floor(selfMaxSize * optionsMaxSize);
		}
	}
};
const getUsageInternal$1 = (self) => {
	switch (self._tag) {
		case "Empty": return empty;
		case "Single": {
			const acceptedValues = isBool(self.primitiveType) ? Option$1.none() : Option$1.orElse(getChoices(self.primitiveType), () => Option$1.some(self.placeholder));
			return named(getNames$1(self), acceptedValues);
		}
		case "KeyValueMap": return getUsageInternal$1(self.argumentOption);
		case "Map": return getUsageInternal$1(self.options);
		case "Both": return concat(getUsageInternal$1(self.left), getUsageInternal$1(self.right));
		case "OrElse": return alternation(getUsageInternal$1(self.left), getUsageInternal$1(self.right));
		case "Variadic": return repeated$4(getUsageInternal$1(self.argumentOption));
		case "WithDefault":
		case "WithFallback": return optional$2(getUsageInternal$1(self.options));
	}
};
const isBoolInternal = (self) => {
	switch (self._tag) {
		case "Single": return isBool(self.primitiveType);
		case "Map": return isBoolInternal(self.options);
		case "WithDefault": return isBoolInternal(self.options);
		default: return false;
	}
};
const makeBoth = (left, right) => {
	const op = Object.create(proto$2);
	op._tag = "Both";
	op.left = left;
	op.right = right;
	return op;
};
const makeFullName = (str) => str.length === 1 ? [true, `-${str}`] : [false, `--${str}`];
const makeKeyValueMap = (argumentOption) => {
	const op = Object.create(proto$2);
	op._tag = "KeyValueMap";
	op.argumentOption = argumentOption;
	return op;
};
const makeMap = (options, f) => {
	const op = Object.create(proto$2);
	op._tag = "Map";
	op.options = options;
	op.f = f;
	return op;
};
const makeOrElse = (left, right) => {
	const op = Object.create(proto$2);
	op._tag = "OrElse";
	op.left = left;
	op.right = right;
	return op;
};
const makeSingle = (name, aliases, primitiveType, description = empty$1, pseudoName = Option$1.none()) => {
	const op = Object.create(proto$2);
	op._tag = "Single";
	op.name = name;
	op.fullName = makeFullName(name)[1];
	op.placeholder = `${Option$1.getOrElse(pseudoName, () => getTypeName(primitiveType))}`;
	op.aliases = aliases;
	op.primitiveType = primitiveType;
	op.description = description;
	op.pseudoName = pseudoName;
	return op;
};
const makeVariadic = (argumentOption, min, max) => {
	if (!isSingle(argumentOption)) throw new Error("InvalidArgumentException: only single options can be variadic");
	const op = Object.create(proto$2);
	op._tag = "Variadic";
	op.argumentOption = argumentOption;
	op.min = min;
	op.max = max;
	return op;
};
const makeWithDefault = (options, fallback) => {
	const op = Object.create(proto$2);
	op._tag = "WithDefault";
	op.options = options;
	op.fallback = fallback;
	return op;
};
const makeWithFallback = (options, effect) => {
	const op = Object.create(proto$2);
	op._tag = "WithFallback";
	op.options = options;
	op.effect = effect;
	return op;
};
const modifySingle = (self, f) => {
	switch (self._tag) {
		case "Empty": return none;
		case "Single": return f(self);
		case "KeyValueMap": return makeKeyValueMap(f(self.argumentOption));
		case "Map": return makeMap(modifySingle(self.options, f), self.f);
		case "Both": return makeBoth(modifySingle(self.left, f), modifySingle(self.right, f));
		case "OrElse": return makeOrElse(modifySingle(self.left, f), modifySingle(self.right, f));
		case "Variadic": return makeVariadic(f(self.argumentOption), self.min, self.max);
		case "WithDefault": return makeWithDefault(modifySingle(self.options, f), self.fallback);
		case "WithFallback": return makeWithFallback(modifySingle(self.options, f), self.effect);
	}
};
/** @internal */
const getNames$1 = (self) => {
	const loop = (self) => {
		switch (self._tag) {
			case "Empty": return Arr.empty();
			case "Single": return Arr.prepend(self.aliases, self.name);
			case "KeyValueMap":
			case "Variadic": return loop(self.argumentOption);
			case "Map":
			case "WithDefault":
			case "WithFallback": return loop(self.options);
			case "Both":
			case "OrElse": {
				const left = loop(self.left);
				const right = loop(self.right);
				return Arr.appendAll(left, right);
			}
		}
	};
	const order = Order.mapInput(Order.boolean, (tuple) => !tuple[0]);
	return pipe(loop(self), Arr.map((str) => makeFullName(str)), Arr.sort(order), Arr.map((tuple) => tuple[1]));
};
const toParseableInstruction = (self) => {
	switch (self._tag) {
		case "Empty": return Arr.empty();
		case "Single":
		case "KeyValueMap":
		case "Variadic": return Arr.of(self);
		case "Map":
		case "WithDefault":
		case "WithFallback": return toParseableInstruction(self.options);
		case "Both":
		case "OrElse": return Arr.appendAll(toParseableInstruction(self.left), toParseableInstruction(self.right));
	}
};
/** @internal */
const keyValueSplitter = /=(.*)/;
const parseInternal$1 = (self, args, config) => {
	switch (self._tag) {
		case "Empty": return Effect$1.void;
		case "Single": {
			const singleNames = Arr.filterMap(getNames$1(self), (name) => HashMap.get(args, name));
			if (Arr.isNonEmptyReadonlyArray(singleNames)) {
				const head = Arr.headNonEmpty(singleNames);
				const tail = Arr.tailNonEmpty(singleNames);
				if (Arr.isEmptyReadonlyArray(tail)) {
					if (Arr.isEmptyReadonlyArray(head)) return validate$1(self.primitiveType, Option$1.none(), config).pipe(Effect$1.mapError((e) => invalidValue(p(e))));
					if (Arr.isNonEmptyReadonlyArray(head) && Arr.isEmptyReadonlyArray(Arr.tailNonEmpty(head))) {
						const value = Arr.headNonEmpty(head);
						return validate$1(self.primitiveType, Option$1.some(value), config).pipe(Effect$1.mapError((e) => invalidValue(p(e))));
					}
					return Effect$1.fail(multipleValuesDetected(empty$1, head));
				}
				const error = p(`More than one reference to option '${self.fullName}' detected`);
				return Effect$1.fail(invalidValue(error));
			}
			const error = p(`Expected to find option: '${self.fullName}'`);
			return Effect$1.fail(missingValue(error));
		}
		case "KeyValueMap": {
			const extractKeyValue = (value) => {
				const split = value.trim().split(keyValueSplitter, 2);
				if (Arr.isNonEmptyReadonlyArray(split) && split.length === 2 && split[1] !== "") return Effect$1.succeed(split);
				const error = p(`Expected a key/value pair but received '${value}'`);
				return Effect$1.fail(invalidArgument(error));
			};
			return parseInternal$1(self.argumentOption, args, config).pipe(Effect$1.matchEffect({
				onFailure: (e) => isMultipleValuesDetected(e) ? Effect$1.forEach(e.values, (kv) => extractKeyValue(kv)).pipe(Effect$1.map(HashMap.fromIterable)) : Effect$1.fail(e),
				onSuccess: (kv) => extractKeyValue(kv).pipe(Effect$1.map(HashMap.make))
			}));
		}
		case "Map": return parseInternal$1(self.options, args, config).pipe(Effect$1.flatMap((a) => self.f(a)));
		case "Both": return parseInternal$1(self.left, args, config).pipe(Effect$1.catchAll((err1) => parseInternal$1(self.right, args, config).pipe(Effect$1.matchEffect({
			onFailure: (err2) => {
				const error = sequence(err1.error, err2.error);
				return Effect$1.fail(missingValue(error));
			},
			onSuccess: () => Effect$1.fail(err1)
		}))), Effect$1.zip(parseInternal$1(self.right, args, config)));
		case "OrElse": return parseInternal$1(self.left, args, config).pipe(Effect$1.matchEffect({
			onFailure: (err1) => parseInternal$1(self.right, args, config).pipe(Effect$1.mapBoth({
				onFailure: (err2) => isMissingValue(err1) && isMissingValue(err2) ? missingValue(sequence(err1.error, err2.error)) : invalidValue(sequence(err1.error, err2.error)),
				onSuccess: (b) => Either$1.right(b)
			})),
			onSuccess: (a) => parseInternal$1(self.right, args, config).pipe(Effect$1.matchEffect({
				onFailure: () => Effect$1.succeed(Either$1.left(a)),
				onSuccess: () => {
					const leftUid = Option$1.getOrElse(getIdentifierInternal(self.left), () => "???");
					const rightUid = Option$1.getOrElse(getIdentifierInternal(self.right), () => "???");
					const error = p(`Collision between two options detected - you can only specify one of either: ['${leftUid}', '${rightUid}']`);
					return Effect$1.fail(invalidValue(error));
				}
			}))
		}));
		case "Variadic": {
			const min = Option$1.getOrElse(self.min, () => 0);
			const max = Option$1.getOrElse(self.max, () => Number.MAX_SAFE_INTEGER);
			const matchedArgument = Arr.filterMap(getNames$1(self), (name) => HashMap.get(args, name));
			const validateMinMax = (values) => {
				if (values.length < min) {
					const name = self.argumentOption.fullName;
					const error = `Expected at least ${min} value(s) for option: '${name}'`;
					return Effect$1.fail(invalidValue(p(error)));
				}
				if (values.length > max) {
					const name = self.argumentOption.fullName;
					const error = `Expected at most ${max} value(s) for option: '${name}'`;
					return Effect$1.fail(invalidValue(p(error)));
				}
				const primitive = self.argumentOption.primitiveType;
				const validatePrimitive = (value) => validate$1(primitive, Option$1.some(value), config).pipe(Effect$1.mapError((e) => invalidValue(p(e))));
				return Effect$1.forEach(values, (value) => validatePrimitive(value));
			};
			if (Arr.every(matchedArgument, Arr.isEmptyReadonlyArray)) return validateMinMax(Arr.empty());
			return parseInternal$1(self.argumentOption, args, config).pipe(Effect$1.matchEffect({
				onFailure: (error) => isMultipleValuesDetected(error) ? validateMinMax(error.values) : Effect$1.fail(error),
				onSuccess: (value) => validateMinMax(Arr.of(value))
			}));
		}
		case "WithDefault": return parseInternal$1(self.options, args, config).pipe(Effect$1.catchTag("MissingValue", () => Effect$1.succeed(self.fallback)));
		case "WithFallback": return parseInternal$1(self.options, args, config).pipe(Effect$1.catchTag("MissingValue", (e) => self.effect.pipe(Effect$1.catchAll((e2) => {
			if (Predicate.isTagged(e2, "QuitException")) return Effect$1.die(e2);
			if (ConfigError.isConfigError(e2) && !ConfigError.isMissingDataOnly(e2)) {
				const help = p(String(e2));
				const error = invalidValue(help);
				return Effect$1.fail(error);
			}
			return Effect$1.fail(e);
		}))));
	}
};
const wizardInternal$1 = (self, config) => {
	switch (self._tag) {
		case "Empty": return Effect$1.succeed(Arr.empty());
		case "Single": {
			const help = getHelpInternal$1(self);
			return wizard$3(self.primitiveType, help).pipe(Effect$1.flatMap((input) => {
				const args = Arr.make(getNames$1(self)[0], input);
				return parseCommandLine(self, args, config).pipe(Effect$1.as(args));
			}), Effect$1.zipLeft(Console.log()));
		}
		case "KeyValueMap": {
			const message = p("Enter `key=value` pairs separated by spaces");
			return list({
				message: toAnsiText(message).trim(),
				delimiter: " "
			}).pipe(Effect$1.flatMap((args) => {
				const identifier = Option$1.getOrElse(getIdentifierInternal(self), () => "");
				return parseInternal$1(self, HashMap.make([identifier, args]), config).pipe(Effect$1.as(Arr.prepend(args, identifier)));
			}), Effect$1.zipLeft(Console.log()));
		}
		case "Map": return wizardInternal$1(self.options, config);
		case "Both": return Effect$1.zipWith(wizardInternal$1(self.left, config), wizardInternal$1(self.right, config), (left, right) => Arr.appendAll(left, right));
		case "OrElse": {
			const alternativeHelp = p("Select which option you would like to use");
			const message = pipe(getHelpInternal$1(self), sequence(alternativeHelp));
			const makeChoice = (title, value) => ({
				title,
				value
			});
			const choices = Arr.getSomes([Option$1.map(getIdentifierInternal(self.left), (title) => makeChoice(title, self.left)), Option$1.map(getIdentifierInternal(self.right), (title) => makeChoice(title, self.right))]);
			return select({
				message: toAnsiText(message).trimEnd(),
				choices
			}).pipe(Effect$1.flatMap((option) => wizardInternal$1(option, config)));
		}
		case "Variadic": {
			const repeatHelp = p("How many times should this argument be repeated?");
			const message = pipe(getHelpInternal$1(self), sequence(repeatHelp));
			return integer({
				message: toAnsiText(message).trimEnd(),
				min: getMinSizeInternal(self),
				max: getMaxSizeInternal(self)
			}).pipe(Effect$1.flatMap((n) => n <= 0 ? Effect$1.succeed(Arr.empty()) : Ref.make(Arr.empty()).pipe(Effect$1.flatMap((ref) => wizardInternal$1(self.argumentOption, config).pipe(Effect$1.flatMap((args) => Ref.update(ref, Arr.appendAll(args))), Effect$1.repeatN(n - 1), Effect$1.zipRight(Ref.get(ref)))))));
		}
		case "WithDefault": {
			if (isBoolInternal(self.options)) return wizardInternal$1(self.options, config);
			const defaultHelp = p(`This option is optional - use the default?`);
			const message = pipe(getHelpInternal$1(self.options), sequence(defaultHelp));
			return select({
				message: toAnsiText(message).trimEnd(),
				choices: [{
					title: "Yes",
					value: true,
					description: `use the default ${Option$1.isOption(self.fallback) ? Option$1.match(self.fallback, {
						onNone: () => "",
						onSome: (a) => `(${JSON.stringify(a)})`
					}) : `(${JSON.stringify(self.fallback)})`}`
				}, {
					title: "No",
					value: false,
					description: "use a custom value"
				}]
			}).pipe(Effect$1.zipLeft(Console.log()), Effect$1.flatMap((useFallback) => useFallback ? Effect$1.succeed(Arr.empty()) : wizardInternal$1(self.options, config)));
		}
		case "WithFallback": {
			if (isBoolInternal(self.options)) return wizardInternal$1(self.options, config);
			if (isPrompt(self.effect)) return wizardInternal$1(self.options, config);
			const defaultHelp = p(`Try load this option from the environment?`);
			const message = pipe(getHelpInternal$1(self.options), sequence(defaultHelp));
			return select({
				message: toAnsiText(message).trimEnd(),
				choices: [{
					title: `Use environment variables`,
					value: true
				}, {
					title: "Custom",
					value: false
				}]
			}).pipe(Effect$1.zipLeft(Console.log()), Effect$1.flatMap((useFallback) => useFallback ? Effect$1.succeed(Arr.empty()) : wizardInternal$1(self.options, config)));
		}
	}
};
/**
* Returns a possible `ValidationError` when parsing the commands, leftover
* arguments from `input` and a mapping between each flag and its values.
*/
const matchOptions = (input, options, config) => {
	if (Arr.isNonEmptyReadonlyArray(options)) return findOptions(input, options, config).pipe(Effect$1.flatMap(([otherArgs, otherOptions, map1]) => {
		if (HashMap.isEmpty(map1)) return Effect$1.succeed([
			Option$1.none(),
			input,
			map1
		]);
		return matchOptions(otherArgs, otherOptions, config).pipe(Effect$1.map(([error, otherArgs, map2]) => [
			error,
			otherArgs,
			merge(map1, Arr.fromIterable(map2))
		]));
	}), Effect$1.catchAll((e) => Effect$1.succeed([
		Option$1.some(e),
		input,
		HashMap.empty()
	])));
	return Arr.isEmptyReadonlyArray(input) ? Effect$1.succeed([
		Option$1.none(),
		Arr.empty(),
		HashMap.empty()
	]) : Effect$1.succeed([
		Option$1.none(),
		input,
		HashMap.empty()
	]);
};
/**
* Returns the leftover arguments, leftover options, and a mapping between the
* first argument with its values if it corresponds to an option flag.
*/
const findOptions = (input, options, config) => Arr.matchLeft(options, {
	onEmpty: () => Effect$1.succeed([
		input,
		Arr.empty(),
		HashMap.empty()
	]),
	onNonEmpty: (head, tail) => parseCommandLine(head, input, config).pipe(Effect$1.flatMap(({ leftover, parsed }) => Option$1.match(parsed, {
		onNone: () => findOptions(leftover, tail, config).pipe(Effect$1.map(([nextArgs, nextOptions, map]) => [
			nextArgs,
			Arr.prepend(nextOptions, head),
			map
		])),
		onSome: ({ name, values }) => Effect$1.succeed([
			leftover,
			tail,
			HashMap.make([name, values])
		])
	})), Effect$1.catchTags({
		CorrectedFlag: (e) => findOptions(input, tail, config).pipe(Effect$1.catchSome(() => Option$1.some(Effect$1.fail(e))), Effect$1.flatMap(([otherArgs, otherOptions, map]) => Effect$1.fail(e).pipe(Effect$1.when(() => HashMap.isEmpty(map)), Effect$1.as([
			otherArgs,
			Arr.prepend(otherOptions, head),
			map
		])))),
		MissingFlag: () => findOptions(input, tail, config).pipe(Effect$1.map(([otherArgs, otherOptions, map]) => [
			otherArgs,
			Arr.prepend(otherOptions, head),
			map
		])),
		UnclusteredFlag: (e) => matchUnclustered(e.unclustered, e.rest, options, config).pipe(Effect$1.catchAll(() => Effect$1.fail(e)))
	}))
});
const CLUSTERED_REGEX = /^-{1}([^-]{2,}$)/;
const FLAG_REGEX = /^(--[^=]+)(?:=(.+))?$/;
/**
* Normalizes the leading command-line argument by performing the following:
*   1. If a clustered series of short command-line options is encountered,
*      uncluster the options and return a `ValidationError.UnclusteredFlag`
*      to be handled later on in the parsing algorithm
*   2. If a long command-line option with a value is encountered, ensure that
*      the option and it's value are separated (i.e. `--option=value` becomes
*      ["--option", "value"])
*/
const processArgs = (args) => Arr.matchLeft(args, {
	onEmpty: () => Effect$1.succeed(Arr.empty()),
	onNonEmpty: (head, tail) => {
		const value = head.trim();
		if (CLUSTERED_REGEX.test(value)) {
			const unclustered = value.substring(1).split("").map((c) => `-${c}`);
			return Effect$1.fail(unclusteredFlag(empty$1, unclustered, tail));
		}
		if (FLAG_REGEX.test(value)) {
			const result = FLAG_REGEX.exec(value);
			if (result !== null && result[2] !== void 0) return Effect$1.succeed(Arr.appendAll([result[1], result[2]], tail));
		}
		return Effect$1.succeed(args);
	}
});
/**
* Processes the command-line arguments for a parseable option, returning the
* parsed command line results, which inclue:
*   - The name of the option and its associated value(s), if any
*   - Any leftover command-line arguments
*/
const parseCommandLine = (self, args, config) => {
	switch (self._tag) {
		case "Single": return processArgs(args).pipe(Effect$1.flatMap((args) => Arr.matchLeft(args, {
			onEmpty: () => {
				const error = p(`Expected to find option: '${self.fullName}'`);
				return Effect$1.fail(missingFlag(error));
			},
			onNonEmpty: (head, tail) => {
				const normalize = (value) => normalizeCase(config, value);
				const normalizedHead = normalize(head);
				const normalizedNames = Arr.map(getNames$1(self), (name) => normalize(name));
				if (Arr.contains(normalizedNames, normalizedHead)) {
					if (isBool(self.primitiveType)) return Arr.matchLeft(tail, {
						onEmpty: () => {
							const parsed = Option$1.some({
								name: head,
								values: Arr.empty()
							});
							return Effect$1.succeed({
								parsed,
								leftover: tail
							});
						},
						onNonEmpty: (value, leftover) => {
							if (isTrueValue(value)) {
								const parsed = Option$1.some({
									name: head,
									values: Arr.of("true")
								});
								return Effect$1.succeed({
									parsed,
									leftover
								});
							}
							if (isFalseValue(value)) {
								const parsed = Option$1.some({
									name: head,
									values: Arr.of("false")
								});
								return Effect$1.succeed({
									parsed,
									leftover
								});
							}
							const parsed = Option$1.some({
								name: head,
								values: Arr.empty()
							});
							return Effect$1.succeed({
								parsed,
								leftover: tail
							});
						}
					});
					return Arr.matchLeft(tail, {
						onEmpty: () => {
							const error = p(`Expected a value following option: '${self.fullName}'`);
							return Effect$1.fail(missingValue(error));
						},
						onNonEmpty: (value, leftover) => {
							const parsed = Option$1.some({
								name: head,
								values: Arr.of(value)
							});
							return Effect$1.succeed({
								parsed,
								leftover
							});
						}
					});
				}
				if (head.startsWith("-")) {
					if (self.name.length > config.autoCorrectLimit + 1 && levensteinDistance(head, self.fullName, config) <= config.autoCorrectLimit) {
						const error = p(`The flag '${head}' is not recognized. Did you mean '${self.fullName}'?`);
						return Effect$1.fail(correctedFlag(error));
					}
					const error = p(`Expected to find option: '${self.fullName}'`);
					return Effect$1.fail(missingFlag(error));
				}
				let optionIndex = -1;
				let equalsValue = void 0;
				for (let i = 0; i < tail.length; i++) {
					const arg = tail[i];
					const normalizedArg = normalize(arg);
					if (Arr.contains(normalizedNames, normalizedArg)) {
						optionIndex = i;
						break;
					}
					const flagMatch = FLAG_REGEX.exec(arg);
					if (flagMatch !== null) {
						const normalizedFlag = normalize(flagMatch[1]);
						if (Arr.contains(normalizedNames, normalizedFlag)) {
							optionIndex = i;
							equalsValue = flagMatch[2];
							break;
						}
					}
				}
				if (optionIndex === -1) {
					const error = p(`Expected to find option: '${self.fullName}'`);
					return Effect$1.fail(missingFlag(error));
				}
				const rawArg = tail[optionIndex];
				const optionName = equalsValue !== void 0 ? FLAG_REGEX.exec(rawArg)[1] : rawArg;
				const beforeOption = Arr.prepend(tail.slice(0, optionIndex), head);
				const afterOption = tail.slice(optionIndex + 1);
				if (isBool(self.primitiveType)) {
					if (equalsValue !== void 0) {
						if (isTrueValue(equalsValue)) {
							const parsed = Option$1.some({
								name: optionName,
								values: Arr.of("true")
							});
							const leftover = Arr.appendAll(beforeOption, afterOption);
							return Effect$1.succeed({
								parsed,
								leftover
							});
						}
						if (isFalseValue(equalsValue)) {
							const parsed = Option$1.some({
								name: optionName,
								values: Arr.of("false")
							});
							const leftover = Arr.appendAll(beforeOption, afterOption);
							return Effect$1.succeed({
								parsed,
								leftover
							});
						}
					}
					if (afterOption.length > 0) {
						const nextValue = afterOption[0];
						if (isTrueValue(nextValue)) {
							const parsed = Option$1.some({
								name: optionName,
								values: Arr.of("true")
							});
							const leftover = Arr.appendAll(beforeOption, afterOption.slice(1));
							return Effect$1.succeed({
								parsed,
								leftover
							});
						}
						if (isFalseValue(nextValue)) {
							const parsed = Option$1.some({
								name: optionName,
								values: Arr.of("false")
							});
							const leftover = Arr.appendAll(beforeOption, afterOption.slice(1));
							return Effect$1.succeed({
								parsed,
								leftover
							});
						}
					}
					const parsed = Option$1.some({
						name: optionName,
						values: Arr.empty()
					});
					const leftover = Arr.appendAll(beforeOption, afterOption);
					return Effect$1.succeed({
						parsed,
						leftover
					});
				}
				if (equalsValue !== void 0) {
					const parsed = Option$1.some({
						name: optionName,
						values: Arr.of(equalsValue)
					});
					const leftover = Arr.appendAll(beforeOption, afterOption);
					return Effect$1.succeed({
						parsed,
						leftover
					});
				}
				if (afterOption.length === 0) {
					const error = p(`Expected a value following option: '${self.fullName}'`);
					return Effect$1.fail(missingValue(error));
				}
				const optionValue = afterOption[0];
				const parsed = Option$1.some({
					name: optionName,
					values: Arr.of(optionValue)
				});
				const leftover = Arr.appendAll(beforeOption, afterOption.slice(1));
				return Effect$1.succeed({
					parsed,
					leftover
				});
			}
		})));
		case "KeyValueMap": {
			const normalizedNames = Arr.map(getNames$1(self.argumentOption), (name) => normalizeCase(config, name));
			return Arr.matchLeft(args, {
				onEmpty: () => Effect$1.succeed({
					parsed: Option$1.none(),
					leftover: args
				}),
				onNonEmpty: (head, tail) => {
					const loop = (args) => {
						let keyValues = Arr.empty();
						let leftover = args;
						while (Arr.isNonEmptyReadonlyArray(leftover)) {
							const name = Arr.headNonEmpty(leftover).trim();
							const normalizedName = normalizeCase(config, name);
							if (leftover.length >= 2 && Arr.contains(normalizedNames, normalizedName)) {
								const keyValue = leftover[1].trim();
								const [key, value] = keyValue.split("=");
								if (key !== void 0 && value !== void 0 && value.length > 0) {
									keyValues = Arr.append(keyValues, keyValue);
									leftover = leftover.slice(2);
									continue;
								}
							}
							if (name.includes("=")) {
								const [key, value] = name.split("=");
								if (key !== void 0 && value !== void 0 && value.length > 0) {
									keyValues = Arr.append(keyValues, name);
									leftover = leftover.slice(1);
									continue;
								}
							}
							break;
						}
						return [keyValues, leftover];
					};
					const normalizedName = normalizeCase(config, head);
					if (Arr.contains(normalizedNames, normalizedName)) {
						const [values, leftover] = loop(tail);
						return Effect$1.succeed({
							parsed: Option$1.some({
								name: head,
								values
							}),
							leftover
						});
					}
					if (head.startsWith("-")) return Effect$1.succeed({
						parsed: Option$1.none(),
						leftover: args
					});
					let optionIndex = -1;
					for (let i = 0; i < tail.length; i++) {
						const arg = tail[i];
						const normalizedArg = normalizeCase(config, arg);
						if (Arr.contains(normalizedNames, normalizedArg)) {
							optionIndex = i;
							break;
						}
					}
					if (optionIndex === -1) return Effect$1.succeed({
						parsed: Option$1.none(),
						leftover: args
					});
					const optionName = tail[optionIndex];
					const beforeOption = Arr.prepend(tail.slice(0, optionIndex), head);
					const [values, remaining] = loop(tail.slice(optionIndex + 1));
					const leftover = Arr.appendAll(beforeOption, remaining);
					return Effect$1.succeed({
						parsed: Option$1.some({
							name: optionName,
							values
						}),
						leftover
					});
				}
			});
		}
		case "Variadic": {
			const normalizedNames = Arr.map(getNames$1(self.argumentOption), (name) => normalizeCase(config, name));
			let optionName = void 0;
			let values = Arr.empty();
			let unparsed = args;
			let leftover = Arr.empty();
			while (Arr.isNonEmptyReadonlyArray(unparsed)) {
				const name = Arr.headNonEmpty(unparsed);
				const normalizedName = normalizeCase(config, name);
				if (Arr.contains(normalizedNames, normalizedName)) {
					if (optionName === void 0) optionName = name;
					const value = unparsed[1];
					if (value !== void 0 && value.length > 0) values = Arr.append(values, value.trim());
					unparsed = unparsed.slice(2);
				} else {
					leftover = Arr.append(leftover, Arr.headNonEmpty(unparsed));
					unparsed = unparsed.slice(1);
				}
			}
			const parsed = Option$1.fromNullable(optionName).pipe(Option$1.orElse(() => Option$1.some(self.argumentOption.fullName)), Option$1.map((name) => ({
				name,
				values
			})));
			return Effect$1.succeed({
				parsed,
				leftover
			});
		}
	}
};
const matchUnclustered = (input, tail, options, config) => {
	if (Arr.isNonEmptyReadonlyArray(input)) {
		const flag = Arr.headNonEmpty(input);
		const otherFlags = Arr.tailNonEmpty(input);
		return findOptions(Arr.of(flag), options, config).pipe(Effect$1.flatMap(([_, opts1, map1]) => {
			if (HashMap.isEmpty(map1)) return Effect$1.fail(unclusteredFlag(empty$1, Arr.empty(), tail));
			return matchUnclustered(otherFlags, tail, opts1, config).pipe(Effect$1.map(([_, opts2, map2]) => [
				tail,
				opts2,
				merge(map1, Arr.fromIterable(map2))
			]));
		}));
	}
	return Effect$1.succeed([
		tail,
		options,
		HashMap.empty()
	]);
};
/**
* Sums the list associated with the same key.
*/
const merge = (map1, map2) => {
	if (Arr.isNonEmptyReadonlyArray(map2)) {
		const head = Arr.headNonEmpty(map2);
		const tail = Arr.tailNonEmpty(map2);
		const newMap = Option$1.match(HashMap.get(map1, head[0]), {
			onNone: () => HashMap.set(map1, head[0], head[1]),
			onSome: (elems) => HashMap.set(map1, head[0], Arr.appendAll(elems, head[1]))
		});
		return merge(newMap, tail);
	}
	return map1;
};
const escape = (string) => escapeSingleQuoted(string.replaceAll("\\", "\\\\")).replaceAll("[", "\\[").replaceAll("]", "\\]").replaceAll(":", "\\:").replaceAll("$", "\\$").replaceAll("`", "\\`").replaceAll("(", "\\(").replaceAll(")", "\\)");
const getShortDescription$1 = (self) => {
	switch (self._tag) {
		case "Empty":
		case "Both":
		case "OrElse": return "";
		case "Single": return getText(getSpan(self.description));
		case "KeyValueMap":
		case "Variadic": return getShortDescription$1(self.argumentOption);
		case "Map":
		case "WithDefault":
		case "WithFallback": return getShortDescription$1(self.options);
	}
};
/** @internal */
const getBashCompletions$1 = (self) => {
	switch (self._tag) {
		case "Empty": return Arr.empty();
		case "Single": {
			const names = getNames$1(self);
			const cases = Arr.join(names, "|");
			const compgen = getBashCompletions$2(self.primitiveType);
			return Arr.make(`${cases})`, `    COMPREPLY=( ${compgen} )`, `    return 0`, `    ;;`);
		}
		case "KeyValueMap":
		case "Variadic": return getBashCompletions$1(self.argumentOption);
		case "Map":
		case "WithDefault":
		case "WithFallback": return getBashCompletions$1(self.options);
		case "Both":
		case "OrElse": {
			const left = getBashCompletions$1(self.left);
			const right = getBashCompletions$1(self.right);
			return Arr.appendAll(left, right);
		}
	}
};
/** @internal */
const getFishCompletions$1 = (self) => {
	switch (self._tag) {
		case "Empty": return Arr.empty();
		case "Single": {
			const description = getShortDescription$1(self);
			const order = Order.mapInput(Order.boolean, (tuple) => !tuple[0]);
			return pipe(Arr.prepend(self.aliases, self.name), Arr.map((name) => [name.length === 1, name]), Arr.sort(order), Arr.flatMap(([isShort, name]) => Arr.make(isShort ? "-s" : "-l", name)), Arr.appendAll(getFishCompletions$3(self.primitiveType)), Arr.appendAll(description.length === 0 ? Arr.empty() : Arr.of(`-d '${escapeSingleQuoted(description)}'`)), Arr.join(" "), Arr.of);
		}
		case "KeyValueMap":
		case "Variadic": return getFishCompletions$1(self.argumentOption);
		case "Map":
		case "WithDefault":
		case "WithFallback": return getFishCompletions$1(self.options);
		case "Both":
		case "OrElse": return pipe(getFishCompletions$1(self.left), Arr.appendAll(getFishCompletions$1(self.right)));
	}
};
/** @internal */
const getZshCompletions$1 = (self, state = {
	conflicts: Arr.empty(),
	multiple: false
}) => {
	switch (self._tag) {
		case "Empty": return Arr.empty();
		case "Single": {
			const names = getNames$1(self);
			const description = getShortDescription$1(self);
			const possibleValues = getZshCompletions$3(self.primitiveType);
			const multiple = state.multiple ? "*" : "";
			const conflicts = Arr.isNonEmptyReadonlyArray(state.conflicts) ? `(${Arr.join(state.conflicts, " ")})` : "";
			return Arr.map(names, (name) => `${conflicts}${multiple}${name}[${escape(description)}]${possibleValues}`);
		}
		case "KeyValueMap": return getZshCompletions$1(self.argumentOption, {
			...state,
			multiple: true
		});
		case "Map":
		case "WithDefault":
		case "WithFallback": return getZshCompletions$1(self.options, state);
		case "Both": {
			const left = getZshCompletions$1(self.left, state);
			const right = getZshCompletions$1(self.right, state);
			return Arr.appendAll(left, right);
		}
		case "OrElse": {
			const leftNames = getNames$1(self.left);
			const rightNames = getNames$1(self.right);
			const left = getZshCompletions$1(self.left, {
				...state,
				conflicts: Arr.appendAll(state.conflicts, rightNames)
			});
			const right = getZshCompletions$1(self.right, {
				...state,
				conflicts: Arr.appendAll(state.conflicts, leftNames)
			});
			return Arr.appendAll(left, right);
		}
		case "Variadic": return Option$1.isSome(self.max) && self.max.value > 1 ? getZshCompletions$1(self.argumentOption, {
			...state,
			multiple: true
		}) : getZshCompletions$1(self.argumentOption, state);
	}
};
//#endregion
//#region ../../node_modules/.bun/@effect+cli@0.77.2+74e017304edf4bf0/node_modules/@effect/cli/dist/esm/internal/builtInOptions.js
/** @internal */
const setLogLevel = (level) => ({
	_tag: "SetLogLevel",
	level
});
/** @internal */
const showCompletions = (shellType) => ({
	_tag: "ShowCompletions",
	shellType
});
/** @internal */
const showHelp = (usage, helpDoc) => ({
	_tag: "ShowHelp",
	usage,
	helpDoc
});
/** @internal */
const showWizard = (command) => ({
	_tag: "ShowWizard",
	command
});
/** @internal */
const showVersion = { _tag: "ShowVersion" };
/** @internal */
const isShowHelp = (self) => self._tag === "ShowHelp";
/** @internal */
const isShowWizard = (self) => self._tag === "ShowWizard";
/** @internal */
const completionsOptions = /*#__PURE__*/ choiceWithValue("completions", [
	["sh", "bash"],
	["bash", "bash"],
	["fish", "fish"],
	["zsh", "zsh"]
]).pipe(optional$1, /*#__PURE__*/ withDescription("Generate a completion script for a specific shell."));
/** @internal */
const logLevelOptions = /*#__PURE__*/ choiceWithValue("log-level", LogLevel.allLevels.map((level) => [level._tag.toLowerCase(), level])).pipe(optional$1, /*#__PURE__*/ withDescription("Sets the minimum log level for a command."));
/** @internal */
const helpOptions = /*#__PURE__*/ boolean$1("help").pipe(/*#__PURE__*/ withAlias("h"), /*#__PURE__*/ withDescription("Show the help documentation for a command."));
/** @internal */
const versionOptions = /*#__PURE__*/ boolean$1("version").pipe(/*#__PURE__*/ withDescription("Show the version of the application."));
/** @internal */
const builtIns = /*#__PURE__*/ all$1({
	completions: completionsOptions,
	logLevel: logLevelOptions,
	help: helpOptions,
	wizard: /* @__PURE__ */ boolean$1("wizard").pipe(/*#__PURE__*/ withDescription("Start wizard mode for a command.")),
	version: versionOptions
});
/** @internal */
const builtInOptions = (command, usage, helpDoc) => map$1(builtIns, (builtIn) => {
	if (Option$1.isSome(builtIn.completions)) return Option$1.some(showCompletions(builtIn.completions.value));
	if (Option$1.isSome(builtIn.logLevel)) return Option$1.some(setLogLevel(builtIn.logLevel.value));
	if (builtIn.help) return Option$1.some(showHelp(usage, helpDoc));
	if (builtIn.wizard) return Option$1.some(showWizard(command));
	if (builtIn.version) return Option$1.some(showVersion);
	return Option$1.none();
});
//#endregion
//#region ../../node_modules/.bun/@effect+cli@0.77.2+74e017304edf4bf0/node_modules/@effect/cli/dist/esm/Options.js
/**
* @since 1.0.0
* @category constructors
*/
const all = all$1;
/**
* @since 1.0.0
* @category constructors
*/
const boolean = boolean$1;
/**
* @since 1.0.0
* @category constructors
*/
const text = text$1;
/**
* @since 1.0.0
* @category combinators
*/
const optional = optional$1;
/**
* Indicates that the specified command-line option can be repeated `0` or more
* times.
*
* **NOTE**: if the command-line option is not provided, and empty array will be
* returned as the value for said option.
*
* @since 1.0.0
* @category combinators
*/
const repeated = repeated$1;
//#endregion
//#region ../../node_modules/.bun/@effect+cli@0.77.2+74e017304edf4bf0/node_modules/@effect/cli/dist/esm/internal/commandDirective.js
/** @internal */
const builtIn = (option) => ({
	_tag: "BuiltIn",
	option
});
/** @internal */
const userDefined = (leftover, value) => ({
	_tag: "UserDefined",
	leftover,
	value
});
/** @internal */
const isBuiltIn = (self) => self._tag === "BuiltIn";
/** @internal */
const isUserDefined = (self) => self._tag === "UserDefined";
/** @internal */
const TypeId$2 = /*#__PURE__*/ Symbol.for("@effect/cli/CommandDescriptor");
const proto$1 = {
	[TypeId$2]: { _A: (_) => _ },
	pipe() {
		return pipeArguments(this, arguments);
	}
};
/** @internal */
const isCommand = (u) => typeof u === "object" && u != null && TypeId$2 in u;
/** @internal */
const isStandard = (self) => self._tag === "Standard";
/** @internal */
const make$4 = (name, options = none, args = none$1) => {
	const op = Object.create(proto$1);
	op._tag = "Standard";
	op.name = name;
	op.description = empty$1;
	op.options = options;
	op.args = args;
	return op;
};
/** @internal */
const getHelp = (self, config) => getHelpInternal(self, config);
/** @internal */
const getNames = (self) => HashSet.fromIterable(getNamesInternal(self));
/** @internal */
const getBashCompletions = (self, executable) => getBashCompletionsInternal(self, executable);
/** @internal */
const getFishCompletions = (self, executable) => getFishCompletionsInternal(self, executable);
/** @internal */
const getZshCompletions = (self, executable) => getZshCompletionsInternal(self, executable);
/** @internal */
const getSubcommands = (self) => HashMap.fromIterable(getSubcommandsInternal(self));
/** @internal */
const getUsage = (self) => getUsageInternal(self);
/** @internal */
const map = /*#__PURE__*/ dual(2, (self, f) => mapEffect(self, (a) => Either$1.right(f(a))));
/** @internal */
const mapEffect = /*#__PURE__*/ dual(2, (self, f) => {
	const op = Object.create(proto$1);
	op._tag = "Map";
	op.command = self;
	op.f = f;
	return op;
});
/** @internal */
const parse = /*#__PURE__*/ dual(3, (self, args, config) => parseInternal(self, args, config));
/** @internal */
const withSubcommands$2 = /*#__PURE__*/ dual(2, (self, subcommands) => {
	const op = Object.create(proto$1);
	op._tag = "Subcommands";
	op.parent = self;
	op.children = Arr.map(subcommands, ([id, command]) => map(command, (a) => [id, a]));
	return op;
});
/** @internal */
const wizard = /*#__PURE__*/ dual(3, (self, prefix, config) => wizardInternal(self, prefix, config));
const getHelpInternal = (self, config) => {
	switch (self._tag) {
		case "Standard": {
			const header = isEmpty$2(self.description) ? empty$1 : sequence(h1("DESCRIPTION"), self.description);
			const argsHelp = getHelp$2(self.args);
			const argsSection = isEmpty$2(argsHelp) ? empty$1 : sequence(h1("ARGUMENTS"), argsHelp);
			const options = config.showBuiltIns ? all([self.options, builtIns]) : self.options;
			const optionsHelp = getHelp$1(options);
			const optionsSection = isEmpty$2(optionsHelp) ? empty$1 : sequence(h1("OPTIONS"), optionsHelp);
			return sequence(header, sequence(argsSection, optionsSection));
		}
		case "GetUserInput": return isEmpty$2(self.description) ? empty$1 : sequence(h1("DESCRIPTION"), self.description);
		case "Map": return getHelpInternal(self.command, config);
		case "Subcommands": {
			const getUsage = (command, preceding) => {
				switch (command._tag) {
					case "Standard":
					case "GetUserInput": {
						const usage = getSpan(getHelp$3(getUsageInternal(command)));
						const usages = Arr.append(preceding, usage);
						const finalUsage = Arr.reduce(usages, empty$2, (acc, next) => isText(acc) && acc.value === "" ? next : isText(next) && next.value === "" ? acc : spans([
							acc,
							space,
							next
						]));
						const description = getSpan(command.description);
						return Arr.of([finalUsage, description]);
					}
					case "Map": return getUsage(command.command, preceding);
					case "Subcommands": {
						const parentUsage = getUsage(command.parent, preceding);
						return Option$1.match(Arr.head(parentUsage), {
							onNone: () => Arr.flatMap(command.children, (child) => getUsage(child, preceding)),
							onSome: ([usage]) => {
								const childrenUsage = Arr.flatMap(command.children, (child) => getUsage(child, Arr.append(preceding, usage)));
								return Arr.appendAll(parentUsage, childrenUsage);
							}
						});
					}
				}
			};
			const printSubcommands = (subcommands) => {
				const maxUsageLength = Arr.reduceRight(subcommands, 0, (max, [usage]) => Math.max(size(usage), max));
				const documents = Arr.map(subcommands, ([usage, desc]) => p(spans([
					usage,
					text$6(" ".repeat(maxUsageLength - size(usage) + 2)),
					desc
				])));
				if (Arr.isNonEmptyReadonlyArray(documents)) return enumeration(documents);
				throw new Error("[BUG]: Subcommands.usage - received empty list of subcommands to print");
			};
			return sequence(getHelpInternal(self.parent, config), sequence(h1("COMMANDS"), printSubcommands(Arr.flatMap(self.children, (child) => getUsage(child, Arr.empty())))));
		}
	}
};
const getNamesInternal = (self) => {
	switch (self._tag) {
		case "Standard":
		case "GetUserInput": return Arr.of(self.name);
		case "Map": return getNamesInternal(self.command);
		case "Subcommands": return getNamesInternal(self.parent);
	}
};
const getSubcommandsInternal = (self) => {
	const loop = (self, isSubcommand) => {
		switch (self._tag) {
			case "Standard":
			case "GetUserInput": return Arr.of([self.name, self]);
			case "Map": return loop(self.command, isSubcommand);
			case "Subcommands": return isSubcommand ? loop(self.parent, false) : Arr.flatMap(self.children, (child) => loop(child, true));
		}
	};
	return loop(self, false);
};
const getUsageInternal = (self) => {
	switch (self._tag) {
		case "Standard": return concat(named(Arr.of(self.name), Option$1.none()), concat(getUsage$1(self.options), getUsage$2(self.args)));
		case "GetUserInput": return named(Arr.of(self.name), Option$1.none());
		case "Map": return getUsageInternal(self.command);
		case "Subcommands": return concat(getUsageInternal(self.parent), mixed);
	}
};
const parseInternal = (self, args, config) => {
	const parseCommandLine = (self, args) => Arr.matchLeft(args, {
		onEmpty: () => {
			const error = p(`Missing command name: '${self.name}'`);
			return Effect$1.fail(commandMismatch(error));
		},
		onNonEmpty: (head, tail) => {
			const normalizedArgv0 = normalizeCase(config, head);
			const normalizedCommandName = normalizeCase(config, self.name);
			return Effect$1.succeed(tail).pipe(Effect$1.when(() => normalizedArgv0 === normalizedCommandName), Effect$1.flatten, Effect$1.catchTag("NoSuchElementException", () => {
				const error = p(`Missing command name: '${self.name}'`);
				return Effect$1.fail(commandMismatch(error));
			}));
		}
	});
	switch (self._tag) {
		case "Standard": {
			const parseBuiltInArgs = (args) => Arr.matchLeft(args, {
				onEmpty: () => {
					const error = p(`Missing command name: '${self.name}'`);
					return Effect$1.fail(commandMismatch(error));
				},
				onNonEmpty: (argv0) => {
					if (normalizeCase(config, argv0) === normalizeCase(config, self.name)) {
						const help = getHelpInternal(self, config);
						const usage = getUsageInternal(self);
						const options = builtInOptions(self, usage, help);
						const argsWithoutCommand = Arr.drop(args, 1);
						return processCommandLine(options, argsWithoutCommand, config).pipe(Effect$1.flatMap((tuple) => tuple[2]), Effect$1.catchTag("NoSuchElementException", () => {
							const error = p("No built-in option was matched");
							return Effect$1.fail(noBuiltInMatch(error));
						}), Effect$1.map(builtIn));
					}
					const error = p(`Missing command name: '${self.name}'`);
					return Effect$1.fail(commandMismatch(error));
				}
			});
			const parseUserDefinedArgs = (args) => parseCommandLine(self, args).pipe(Effect$1.flatMap((commandOptionsAndArgs) => {
				const [optionsAndArgs, forcedCommandArgs] = splitForcedArgs(commandOptionsAndArgs);
				return processCommandLine(self.options, optionsAndArgs, config).pipe(Effect$1.flatMap(([error, commandArgs, optionsType]) => validate(self.args, Arr.appendAll(commandArgs, forcedCommandArgs), config).pipe(Effect$1.catchAll((e) => Option$1.match(error, {
					onNone: () => Effect$1.fail(e),
					onSome: (err) => Effect$1.fail(err)
				})), Effect$1.map(([argsLeftover, argsType]) => userDefined(argsLeftover, {
					name: self.name,
					options: optionsType,
					args: argsType
				})))));
			}));
			const exhaustiveSearch = (args) => {
				if (Arr.contains(args, "--help") || Arr.contains(args, "-h")) return parseBuiltInArgs(Arr.make(self.name, "--help"));
				if (Arr.contains(args, "--wizard")) return parseBuiltInArgs(Arr.make(self.name, "--wizard"));
				if (Arr.contains(args, "--version")) return parseBuiltInArgs(Arr.make(self.name, "--version"));
				const error = p(`Missing command name: '${self.name}'`);
				return Effect$1.fail(commandMismatch(error));
			};
			return parseBuiltInArgs(args).pipe(Effect$1.orElse(() => parseUserDefinedArgs(args)), Effect$1.catchSome((e) => {
				if (isValidationError(e)) {
					if (config.finalCheckBuiltIn) return Option$1.some(exhaustiveSearch(args).pipe(Effect$1.catchSome((_) => isValidationError(_) ? Option$1.some(Effect$1.fail(e)) : Option$1.none())));
					return Option$1.some(Effect$1.fail(e));
				}
				return Option$1.none();
			}));
		}
		case "GetUserInput": return parseCommandLine(self, args).pipe(Effect$1.zipRight(run$3(self.prompt)), Effect$1.catchTag("QuitException", (e) => Effect$1.die(e)), Effect$1.map((value) => userDefined(Arr.drop(args, 1), {
			name: self.name,
			value
		})));
		case "Map": return parseInternal(self.command, args, config).pipe(Effect$1.flatMap((directive) => {
			if (isUserDefined(directive)) return self.f(directive.value).pipe(Effect$1.map((value) => userDefined(directive.leftover, value)));
			return Effect$1.succeed(directive);
		}));
		case "Subcommands": {
			const names = getNamesInternal(self);
			const subcommands = getSubcommandsInternal(self);
			const [parentArgs, childArgs] = Arr.span(args, (arg) => !Arr.some(subcommands, ([name]) => name === arg));
			const parseChildrenWith = (argsForChildren) => Effect$1.suspend(() => {
				const iterator = self.children[Symbol.iterator]();
				const loop = (next) => {
					return parseInternal(next, argsForChildren, config).pipe(Effect$1.catchIf(isCommandMismatch, (e) => {
						const next = iterator.next();
						return next.done ? Effect$1.fail(e) : loop(next.value);
					}));
				};
				return loop(iterator.next().value);
			});
			const parseChildren = parseChildrenWith(childArgs);
			const helpDirectiveForParent = Effect$1.sync(() => {
				return builtIn(showHelp(getUsageInternal(self), getHelpInternal(self, config)));
			});
			const helpDirectiveForChild = parseChildren.pipe(Effect$1.flatMap((directive) => {
				if (isBuiltIn(directive) && isShowHelp(directive.option)) {
					const parentName = Option$1.getOrElse(Arr.head(names), () => "");
					const newDirective = builtIn(showHelp(concat(named(Arr.of(parentName), Option$1.none()), directive.option.usage), directive.option.helpDoc));
					return Effect$1.succeed(newDirective);
				}
				return Effect$1.fail(invalidArgument(empty$1));
			}));
			const wizardDirectiveForParent = Effect$1.sync(() => builtIn(showWizard(self)));
			const wizardDirectiveForChild = parseChildren.pipe(Effect$1.flatMap((directive) => {
				if (isBuiltIn(directive) && isShowWizard(directive.option)) return Effect$1.succeed(directive);
				return Effect$1.fail(invalidArgument(empty$1));
			}));
			return Effect$1.suspend(() => parseInternal(self.parent, parentArgs, config).pipe(Effect$1.flatMap((directive) => {
				switch (directive._tag) {
					case "BuiltIn":
						if (isShowHelp(directive.option)) return Arr.isNonEmptyReadonlyArray(childArgs) ? Effect$1.orElse(helpDirectiveForChild, () => helpDirectiveForParent) : helpDirectiveForParent;
						if (isShowWizard(directive.option)) return Effect$1.orElse(wizardDirectiveForChild, () => wizardDirectiveForParent);
						return Effect$1.succeed(directive);
					case "UserDefined": {
						const args = Arr.appendAll(directive.leftover, childArgs);
						if (Arr.isNonEmptyReadonlyArray(args)) return parseChildrenWith(args).pipe(Effect$1.flatMap((childDirective) => {
							if (!isUserDefined(childDirective)) return Effect$1.succeed(childDirective);
							const childLeftover = childDirective.leftover;
							if (Arr.isEmptyReadonlyArray(childLeftover)) return Effect$1.succeed(userDefined(childLeftover, {
								...directive.value,
								subcommand: Option$1.some(childDirective.value)
							}));
							const parentArgsWithLeftover = Arr.appendAll(parentArgs, childLeftover);
							return parseInternal(self.parent, parentArgsWithLeftover, config).pipe(Effect$1.flatMap((reParsedParentDirective) => {
								if (!isUserDefined(reParsedParentDirective)) return Effect$1.succeed(userDefined(childLeftover, {
									...directive.value,
									subcommand: Option$1.some(childDirective.value)
								}));
								return Effect$1.succeed(userDefined(reParsedParentDirective.leftover, {
									...reParsedParentDirective.value,
									subcommand: Option$1.some(childDirective.value)
								}));
							}), Effect$1.catchAll(() => Effect$1.succeed(userDefined(childLeftover, {
								...directive.value,
								subcommand: Option$1.some(childDirective.value)
							}))));
						}), Effect$1.catchAll((err) => {
							if (isCommandMismatch(err)) {
								const parentName = Option$1.getOrElse(Arr.head(names), () => "");
								const childNames = Arr.map(subcommands, ([name]) => `'${name}'`);
								const oneOf = childNames.length === 1 ? "" : " one of";
								const error = p(`Invalid subcommand for ${parentName} - use${oneOf} ${Arr.join(childNames, ", ")}`);
								return Effect$1.fail(commandMismatch(error));
							}
							return Effect$1.fail(err);
						}));
						return Effect$1.succeed(userDefined(directive.leftover, {
							...directive.value,
							subcommand: Option$1.none()
						}));
					}
				}
			}), Effect$1.catchSome(() => Arr.isEmptyReadonlyArray(args) ? Option$1.some(helpDirectiveForParent) : Option$1.none())));
		}
	}
};
const splitForcedArgs = (args) => {
	const [remainingArgs, forcedArgs] = Arr.span(args, (str) => str !== "--");
	return [remainingArgs, Arr.drop(forcedArgs, 1)];
};
const argsWizardHeader = /*#__PURE__*/ code("Args Wizard - ");
const optionsWizardHeader = /*#__PURE__*/ code("Options Wizard - ");
const wizardInternal = (self, prefix, config) => {
	const loop = (self, commandLineRef) => {
		switch (self._tag) {
			case "GetUserInput":
			case "Standard": return Effect$1.gen(function* () {
				const logCurrentCommand = Ref.get(commandLineRef).pipe(Effect$1.flatMap((commandLine) => {
					const currentCommand = p(pipe(strong(highlight("COMMAND:", cyan)), concat$1(space), concat$1(highlight(Arr.join(commandLine, " "), magenta))));
					return Console.log(toAnsiText(currentCommand));
				}));
				if (isStandard(self)) {
					yield* logCurrentCommand;
					const commandName = highlight(self.name, magenta);
					if (!isEmpty(self.options)) {
						const message = p(concat$1(optionsWizardHeader, commandName));
						yield* Console.log(toAnsiText(message));
						const options = yield* wizard$1(self.options, config);
						yield* Ref.updateAndGet(commandLineRef, Arr.appendAll(options));
						yield* logCurrentCommand;
					}
					if (!isEmpty$1(self.args)) {
						const message = p(concat$1(argsWizardHeader, commandName));
						yield* Console.log(toAnsiText(message));
						const options = yield* wizard$2(self.args, config);
						yield* Ref.updateAndGet(commandLineRef, Arr.appendAll(options));
						yield* logCurrentCommand;
					}
				}
				return yield* Ref.get(commandLineRef);
			});
			case "Map": return loop(self.command, commandLineRef);
			case "Subcommands": {
				const description = p("Select which command you would like to execute");
				const message = toAnsiText(description).trimEnd();
				const makeChoice = (title, index) => ({
					title,
					value: [title, index]
				});
				const choices = pipe(getSubcommandsInternal(self), Arr.map(([name], index) => makeChoice(name, index)));
				return loop(self.parent, commandLineRef).pipe(Effect$1.zipRight(select({
					message,
					choices
				}).pipe(Effect$1.tap(([name]) => Ref.update(commandLineRef, Arr.append(name))), Effect$1.zipLeft(Console.log()), Effect$1.flatMap(([, nextIndex]) => loop(self.children[nextIndex], commandLineRef)))));
			}
		}
	};
	return Ref.make(prefix).pipe(Effect$1.flatMap((commandLineRef) => loop(self, commandLineRef).pipe(Effect$1.zipRight(Ref.get(commandLineRef)))));
};
const getShortDescription = (self) => {
	switch (self._tag) {
		case "Standard": return getText(getSpan(self.description));
		case "GetUserInput": return getText(getSpan(self.description));
		case "Map": return getShortDescription(self.command);
		case "Subcommands": return "";
	}
};
/**
* Allows for linear traversal of a `Command` data structure, accumulating state
* based on information acquired from the command.
*/
const traverseCommand = (self, initialState, f) => SynchronizedRef.make(initialState).pipe(Effect$1.flatMap((ref) => {
	const loop = (self, parentCommands, subcommands, level) => {
		switch (self._tag) {
			case "Standard": {
				const info = {
					command: self,
					parentCommands,
					subcommands,
					level
				};
				return SynchronizedRef.updateEffect(ref, (state) => f(state, info));
			}
			case "GetUserInput": {
				const info = {
					command: self,
					parentCommands,
					subcommands,
					level
				};
				return SynchronizedRef.updateEffect(ref, (state) => f(state, info));
			}
			case "Map": return loop(self.command, parentCommands, subcommands, level);
			case "Subcommands": {
				const parentNames = getNamesInternal(self.parent);
				const nextSubcommands = getSubcommandsInternal(self);
				const nextParentCommands = Arr.appendAll(parentCommands, parentNames);
				return loop(self.parent, parentCommands, nextSubcommands, level).pipe(Effect$1.zipRight(Effect$1.forEach(self.children, (child) => loop(child, nextParentCommands, subcommands, level + 1))));
			}
		}
	};
	return Effect$1.suspend(() => loop(self, Arr.empty(), Arr.empty(), 0)).pipe(Effect$1.zipRight(SynchronizedRef.get(ref)));
}));
const indentAll = /*#__PURE__*/ dual(2, (self, indent) => {
	const indentation = Arr.allocate(indent + 1).join(" ");
	return Arr.map(self, (line) => `${indentation}${line}`);
});
const getBashCompletionsInternal = (self, executable) => traverseCommand(self, Arr.empty(), (state, info) => {
	const options = isStandard(info.command) ? all([info.command.options, builtIns]) : builtIns;
	const optionNames = getNames$1(options);
	const optionCases = isStandard(info.command) ? getBashCompletions$1(info.command.options) : Arr.empty();
	const subcommandNames = pipe(info.subcommands, Arr.map(([name]) => name), Arr.sort(Order.string));
	const wordList = Arr.appendAll(optionNames, subcommandNames);
	const preformatted = Arr.isEmptyReadonlyArray(info.parentCommands) ? Arr.of(info.command.name) : pipe(info.parentCommands, Arr.append(info.command.name), Arr.map((command) => command.replaceAll("-", "__")));
	const caseName = Arr.join(preformatted, ",");
	const funcName = Arr.join(preformatted, "__");
	const funcLines = Arr.isEmptyReadonlyArray(info.parentCommands) ? Arr.empty() : [
		`${caseName})`,
		`    cmd="${funcName}"`,
		"    ;;"
	];
	const cmdLines = [
		`${funcName})`,
		`    opts="${Arr.join(wordList, " ")}"`,
		`    if [[ \${cur} == -* || \${COMP_CWORD} -eq ${info.level + 1} ]] ; then`,
		"        COMPREPLY=( $(compgen -W \"${opts}\" -- \"${cur}\") )",
		"        return 0",
		"    fi",
		"    case \"${prev}\" in",
		...indentAll(optionCases, 8),
		"    *)",
		"        COMPREPLY=()",
		"        ;;",
		"    esac",
		"    COMPREPLY=( $(compgen -W \"${opts}\" -- \"${cur}\") )",
		"    return 0",
		"    ;;"
	];
	const lines = Arr.append(state, [funcLines, cmdLines]);
	return Effect$1.succeed(lines);
}).pipe(Effect$1.map((lines) => {
	const rootCommand = Arr.unsafeGet(getNamesInternal(self), 0);
	const scriptName = `_${rootCommand}_bash_completions`;
	const funcCases = Arr.flatMap(lines, ([funcLines]) => funcLines);
	const cmdCases = Arr.flatMap(lines, ([, cmdLines]) => cmdLines);
	return [
		`function ${scriptName}() {`,
		"    local i cur prev opts cmd",
		"    COMPREPLY=()",
		"    cur=\"${COMP_WORDS[COMP_CWORD]}\"",
		"    prev=\"${COMP_WORDS[COMP_CWORD-1]}\"",
		"    cmd=\"\"",
		"    opts=\"\"",
		"    for i in \"${COMP_WORDS[@]}\"; do",
		"        case \"${cmd},${i}\" in",
		"            \",$1\")",
		`                cmd="${executable}"`,
		"                ;;",
		...indentAll(funcCases, 12),
		"            *)",
		"                ;;",
		"        esac",
		"    done",
		"    case \"${cmd}\" in",
		...indentAll(cmdCases, 8),
		"    esac",
		"}",
		`complete -F ${scriptName} -o nosort -o bashdefault -o default ${rootCommand}`
	];
}));
const getFishCompletionsInternal = (self, executable) => traverseCommand(self, Arr.empty(), (state, info) => {
	const baseTemplate = Arr.make("complete", "-c", executable);
	const options = isStandard(info.command) ? all$1([builtIns, info.command.options]) : builtIns;
	const optionsCompletions = getFishCompletions$1(options);
	const argsCompletions = isStandard(info.command) ? getFishCompletions$2(info.command.args) : Arr.empty();
	const rootCompletions = (conditionals) => pipe(Arr.map(optionsCompletions, (option) => pipe(baseTemplate, Arr.appendAll(conditionals), Arr.append(option), Arr.join(" "))), Arr.appendAll(Arr.map(argsCompletions, (option) => pipe(baseTemplate, Arr.appendAll(conditionals), Arr.append(option), Arr.join(" ")))));
	const subcommandCompletions = (conditionals) => Arr.map(info.subcommands, ([name, subcommand]) => {
		const description = getShortDescription(subcommand);
		return pipe(baseTemplate, Arr.appendAll(conditionals), Arr.appendAll(Arr.make("-f", "-a", `"${name}"`)), Arr.appendAll(description.length === 0 ? Arr.empty() : Arr.make("-d", `'${escapeSingleQuoted(description)}'`)), Arr.join(" "));
	});
	if (Arr.isEmptyReadonlyArray(info.parentCommands)) {
		const conditionals = Arr.make("-n", "\"__fish_use_subcommand\"");
		return Effect$1.succeed(pipe(state, Arr.appendAll(rootCompletions(conditionals)), Arr.appendAll(subcommandCompletions(conditionals))));
	}
	const parentConditionals = pipe(info.parentCommands, Arr.drop(1), Arr.append(info.command.name), Arr.map((command) => `__fish_seen_subcommand_from ${command}`));
	const subcommandConditionals = Arr.map(info.subcommands, ([name]) => `not __fish_seen_subcommand_from ${name}`);
	const baseConditionals = pipe(Arr.appendAll(parentConditionals, subcommandConditionals), Arr.join("; and "));
	const conditionals = Arr.make("-n", `"${baseConditionals}"`);
	return Effect$1.succeed(pipe(state, Arr.appendAll(rootCompletions(conditionals)), Arr.appendAll(subcommandCompletions(conditionals))));
});
const getZshCompletionsInternal = (self, executable) => traverseCommand(self, Arr.empty(), (state, info) => {
	const preformatted = Arr.isEmptyReadonlyArray(info.parentCommands) ? Arr.of(info.command.name) : pipe(info.parentCommands, Arr.append(info.command.name), Arr.map((command) => command.replaceAll("-", "__")));
	const underscoreName = Arr.join(preformatted, "__");
	const spaceName = Arr.join(preformatted, " ");
	const subcommands = pipe(info.subcommands, Arr.map(([name, subcommand]) => {
		const desc = getShortDescription(subcommand);
		return `'${name}:${escapeSingleQuoted(desc)}' \\`;
	}));
	const commands = Arr.isEmptyReadonlyArray(subcommands) ? `commands=()` : `commands=(\n${Arr.join(indentAll(subcommands, 8), "\n")}\n    )`;
	const handlerLines = [
		`(( $+functions[_${underscoreName}_commands] )) ||`,
		`_${underscoreName}_commands() {`,
		`    local commands; ${commands}`,
		`    _describe -t commands '${spaceName} commands' commands "$@"`,
		"}"
	];
	return Effect$1.succeed(Arr.appendAll(state, handlerLines));
}).pipe(Effect$1.map((handlers) => {
	const rootCommand = Arr.unsafeGet(getNamesInternal(self), 0);
	const cases = getZshSubcommandCases(self, Arr.empty(), Arr.empty());
	const scriptName = `_${rootCommand}_zsh_completions`;
	return [
		`#compdef ${executable}`,
		"",
		"autoload -U is-at-least",
		"",
		`function ${scriptName}() {`,
		"    typeset -A opt_args",
		"    typeset -a _arguments_options",
		"    local ret=1",
		"",
		"    if is-at-least 5.2; then",
		"        _arguments_options=(-s -S -C)",
		"    else",
		"        _arguments_options=(-s -C)",
		"    fi",
		"",
		"    local context curcontext=\"$curcontext\" state line",
		...indentAll(cases, 4),
		"}",
		"",
		...handlers,
		"",
		`if [ "$funcstack[1]" = "${scriptName}" ]; then`,
		`    ${scriptName} "$@"`,
		"else",
		`    compdef ${scriptName} ${rootCommand}`,
		"fi"
	];
}));
const getZshSubcommandCases = (self, parentCommands, subcommands) => {
	switch (self._tag) {
		case "Standard":
		case "GetUserInput": {
			const options = isStandard(self) ? all$1([builtIns, self.options]) : builtIns;
			const args = isStandard(self) ? self.args : none$1;
			const optionCompletions = pipe(getZshCompletions$1(options), Arr.map((completion) => `'${completion}' \\`));
			const argCompletions = pipe(getZshCompletions$2(args), Arr.map((completion) => `'${completion}' \\`));
			if (Arr.isEmptyReadonlyArray(parentCommands)) return [
				"_arguments \"${_arguments_options[@]}\" \\",
				...indentAll(optionCompletions, 4),
				...indentAll(argCompletions, 4),
				`    ":: :_${self.name}_commands" \\`,
				`    "*::: :->${self.name}" \\`,
				"    && ret=0"
			];
			if (Arr.isEmptyReadonlyArray(subcommands)) return [
				`(${self.name})`,
				"_arguments \"${_arguments_options[@]}\" \\",
				...indentAll(optionCompletions, 4),
				...indentAll(argCompletions, 4),
				"    && ret=0",
				";;"
			];
			return [
				`(${self.name})`,
				"_arguments \"${_arguments_options[@]}\" \\",
				...indentAll(optionCompletions, 4),
				...indentAll(argCompletions, 4),
				`    ":: :_${Arr.append(parentCommands, self.name).join("__")}_commands" \\`,
				`    "*::: :->${self.name}" \\`,
				"    && ret=0"
			];
		}
		case "Map": return getZshSubcommandCases(self.command, parentCommands, subcommands);
		case "Subcommands": {
			const nextSubcommands = getSubcommandsInternal(self);
			const parentNames = getNamesInternal(self.parent);
			const parentLines = getZshSubcommandCases(self.parent, parentCommands, Arr.appendAll(subcommands, nextSubcommands));
			const childCases = pipe(self.children, Arr.flatMap((child) => getZshSubcommandCases(child, Arr.appendAll(parentCommands, parentNames), subcommands)));
			const hyphenName = pipe(Arr.appendAll(parentCommands, parentNames), Arr.join("-"));
			const childLines = pipe(parentNames, Arr.flatMap((parentName) => [
				"case $state in",
				`    (${parentName})`,
				`    words=($line[1] "\${words[@]}")`,
				"    (( CURRENT += 1 ))",
				`    curcontext="\${curcontext%:*:*}:${hyphenName}-command-$line[1]:"`,
				`    case $line[1] in`,
				...indentAll(childCases, 8),
				"    esac",
				"    ;;",
				"esac"
			]), Arr.appendAll(Arr.isEmptyReadonlyArray(parentCommands) ? Arr.empty() : Arr.of(";;")));
			return Arr.appendAll(parentLines, childLines);
		}
	}
};
/** @internal */
const helpRequestedError = (command) => {
	const op = Object.create(proto$4);
	op._tag = "HelpRequested";
	op.error = empty$1;
	op.command = command;
	return op;
};
//#endregion
//#region ../../node_modules/.bun/@effect+cli@0.77.2+74e017304edf4bf0/node_modules/@effect/cli/dist/esm/internal/cliApp.js
const proto = { pipe() {
	return pipeArguments(this, arguments);
} };
/** @internal */
const make$3 = (config) => {
	const op = Object.create(proto);
	op.name = config.name;
	op.version = config.version;
	op.executable = config.executable;
	op.command = config.command;
	op.summary = config.summary || empty$2;
	op.footer = config.footer || empty$1;
	return op;
};
/** @internal */
const run$2 = /*#__PURE__*/ dual(3, (self, args, execute) => Effect$1.contextWithEffect((context) => {
	const config = Option$1.getOrElse(Context.getOption(context, Tag), () => defaultConfig);
	const [executable, filteredArgs] = splitExecutable(self, args);
	const prefixedArgs = Arr.appendAll(prefixCommand(self.command), filteredArgs);
	return Effect$1.matchEffect(parse(self.command, prefixedArgs, config), {
		onFailure: (e) => Effect$1.zipRight(printDocs(e.error), Effect$1.fail(e)),
		onSuccess: Unify.unify((directive) => {
			switch (directive._tag) {
				case "UserDefined": return Arr.matchLeft(directive.leftover, {
					onEmpty: () => execute(directive.value).pipe(Effect$1.catchSome((e) => isValidationError(e) && isHelpRequested(e) ? Option$1.some(handleBuiltInOption(self, executable, filteredArgs, showHelp(getUsage(e.command), getHelp(e.command, config)), execute, config, args)) : Option$1.none())),
					onNonEmpty: (head) => {
						const error = p(`Received unknown argument: '${head}'`);
						return Effect$1.zipRight(printDocs(error), Effect$1.fail(invalidValue(error)));
					}
				});
				case "BuiltIn": return handleBuiltInOption(self, executable, filteredArgs, directive.option, execute, config, args).pipe(Effect$1.catchSome((e) => isValidationError(e) ? Option$1.some(Effect$1.zipRight(printDocs(e.error), Effect$1.fail(e))) : Option$1.none()));
			}
		})
	});
}));
const splitExecutable = (self, args) => {
	if (self.executable !== void 0) return [self.executable, Arr.drop(args, 2)];
	const [[runtime, script], optionsAndArgs] = Arr.splitAt(args, 2);
	return [`${runtime} ${script}`, optionsAndArgs];
};
const printDocs = (error) => Console.error(toAnsiText(error));
const handleBuiltInOption = (self, executable, args, builtIn, execute, config, originalArgs) => {
	switch (builtIn._tag) {
		case "SetLogLevel": {
			const baseArgs = Arr.take(originalArgs, 2);
			const filteredArgs = [];
			for (let i = 0; i < args.length; i++) {
				if (isLogLevelArg(args[i]) || args[i - 1] === "--log-level") continue;
				filteredArgs.push(args[i]);
			}
			const nextArgs = Arr.appendAll(baseArgs, filteredArgs);
			return run$2(self, nextArgs, execute).pipe(Logger.withMinimumLogLevel(builtIn.level));
		}
		case "ShowHelp": {
			const banner = h1(code(self.name));
			const header = p(spans([text$6(`${self.name} ${self.version}`), isEmpty$3(self.summary) ? empty$2 : spans([
				space,
				text$6("--"),
				space,
				self.summary
			])]));
			const usage = sequence(h1("USAGE"), pipe(enumerate(builtIn.usage, config), Arr.map((span) => p(concat$1(text$6("$ "), span))), Arr.reduceRight(empty$1, (left, right) => sequence(left, right))));
			const helpDoc = pipe(banner, sequence(header), sequence(usage), sequence(builtIn.helpDoc), sequence(self.footer));
			return Console.log(toAnsiText(helpDoc));
		}
		case "ShowCompletions": {
			const command = Arr.fromIterable(getNames(self.command))[0];
			switch (builtIn.shellType) {
				case "bash": return getBashCompletions(self.command, command).pipe(Effect$1.flatMap((completions) => Console.log(Arr.join(completions, "\n"))));
				case "fish": return getFishCompletions(self.command, command).pipe(Effect$1.flatMap((completions) => Console.log(Arr.join(completions, "\n"))));
				case "zsh": return getZshCompletions(self.command, command).pipe(Effect$1.flatMap((completions) => Console.log(Arr.join(completions, "\n"))));
			}
		}
		case "ShowWizard": {
			const summary = isEmpty$3(self.summary) ? empty$2 : spans([
				space,
				text$6("--"),
				space,
				self.summary
			]);
			const instructions = sequence(p(spans([
				text$6("The wizard mode will assist you with constructing commands for"),
				space,
				code(`${self.name} (${self.version})`),
				text$6(".")
			])), p("Please answer all prompts provided by the wizard."));
			const description = descriptionList([[text$6("Instructions"), instructions]]);
			const header = h1(spans([
				code("Wizard Mode for CLI Application:"),
				space,
				code(self.name),
				space,
				code(`(${self.version})`),
				summary
			]));
			const help = sequence(header, description);
			const text = toAnsiText(help);
			const command = Arr.fromIterable(getNames(self.command))[0];
			const wizardPrefix = getWizardPrefix(builtIn, command, args);
			return Console.log(text).pipe(Effect$1.zipRight(wizard(builtIn.command, wizardPrefix, config)), Effect$1.tap((args) => Console.log(toAnsiText(renderWizardArgs(args)))), Effect$1.flatMap((args) => toggle({
				message: "Would you like to run the command?",
				initial: true,
				active: "yes",
				inactive: "no"
			}).pipe(Effect$1.flatMap((shouldRunCommand) => {
				const baseArgs = Arr.take(originalArgs, 2);
				const wizardArgs = Arr.drop(args, 1);
				const finalArgs = Arr.appendAll(baseArgs, wizardArgs);
				return shouldRunCommand ? Console.log().pipe(Effect$1.zipRight(run$2(self, finalArgs, execute))) : Effect$1.void;
			}))), Effect$1.catchAll((e) => {
				if (isQuitException(e)) {
					const message = p(error("\n\nQuitting wizard mode..."));
					return Console.log(toAnsiText(message));
				}
				return Effect$1.fail(e);
			}));
		}
		case "ShowVersion": {
			const help = p(self.version);
			return Console.log(toAnsiText(help));
		}
	}
};
const prefixCommand = (self) => {
	let command = self;
	let prefix = Arr.empty();
	while (command !== void 0) switch (command._tag) {
		case "Standard":
			prefix = Arr.of(command.name);
			command = void 0;
			break;
		case "GetUserInput":
			prefix = Arr.of(command.name);
			command = void 0;
			break;
		case "Map":
			command = command.command;
			break;
		case "Subcommands": command = command.parent;
	}
	return prefix;
};
const getWizardPrefix = (builtIn, rootCommand, commandLineArgs) => {
	const subcommands = getSubcommands(builtIn.command);
	const [parentArgs, childArgs] = Arr.span(commandLineArgs, (name) => !HashMap.has(subcommands, name));
	const args = Arr.matchLeft(childArgs, {
		onEmpty: () => Arr.filter(parentArgs, (arg) => arg !== "--wizard"),
		onNonEmpty: (head) => Arr.append(parentArgs, head)
	});
	return Arr.appendAll(rootCommand.split(/\s+/), args);
};
const renderWizardArgs = (args) => {
	const params = pipe(Arr.filter(args, (param) => param.length > 0), Arr.join(" "));
	const executeMsg = text$6("You may now execute your command directly with the following options and arguments:");
	return blocks([
		p(strong(code("Wizard Mode Complete!"))),
		p(executeMsg),
		p(concat$1(text$6("    "), highlight(params, cyan)))
	]);
};
const isLogLevelArg = (arg) => {
	return arg && (arg === "--log-level" || arg.startsWith("--log-level="));
};
//#endregion
//#region ../../node_modules/.bun/@effect+cli@0.77.2+74e017304edf4bf0/node_modules/@effect/cli/dist/esm/ValidationError.js
/**
* @since 1.0.0
* @category constructors
*/
const helpRequested = helpRequestedError;
/** @internal */
const TypeId$1 = /*#__PURE__*/ Symbol.for("@effect/cli/Command");
const parseConfig = (config) => {
	const args = [];
	let argsIndex = 0;
	const options = [];
	let optionsIndex = 0;
	function parse(config) {
		const tree = {};
		for (const key in config) tree[key] = parseValue(config[key]);
		return tree;
	}
	function parseValue(value) {
		if (Arr.isArray(value)) return {
			_tag: "Array",
			children: Arr.map(value, parseValue)
		};
		else if (isArgs(value)) {
			args.push(value);
			return {
				_tag: "Args",
				index: argsIndex++
			};
		} else if (isOptions(value)) {
			options.push(value);
			return {
				_tag: "Options",
				index: optionsIndex++
			};
		} else return {
			_tag: "ParsedConfig",
			tree: parse(value)
		};
	}
	return {
		args,
		options,
		tree: parse(config)
	};
};
const reconstructConfigTree = (tree, args, options) => {
	const output = {};
	for (const key in tree) output[key] = nodeValue(tree[key]);
	return output;
	function nodeValue(node) {
		if (node._tag === "Args") return args[node.index];
		else if (node._tag === "Options") return options[node.index];
		else if (node._tag === "Array") return Arr.map(node.children, nodeValue);
		else return reconstructConfigTree(node.tree, args, options);
	}
};
const Prototype = {
	...Effectable.CommitPrototype,
	[TypeId$1]: TypeId$1,
	commit() {
		return this.tag;
	},
	pipe() {
		return pipeArguments(this, arguments);
	}
};
const registeredDescriptors = /*#__PURE__*/ globalValue("@effect/cli/Command/registeredDescriptors", () => /* @__PURE__ */ new WeakMap());
const getDescriptor = (self) => registeredDescriptors.get(self.tag) ?? self.descriptor;
const makeProto = (descriptor, handler, tag, transform = identity) => {
	const self = Object.create(Prototype);
	self.descriptor = descriptor;
	self.handler = handler;
	self.transform = transform;
	self.tag = tag;
	return self;
};
const makeDerive = (self, options) => {
	const command = Object.create(Prototype);
	command.descriptor = options.descriptor ?? self.descriptor;
	command.handler = options.handler ?? self.handler;
	command.transform = options.transform ? (effect, opts) => options.transform(self.transform(effect, opts), opts) : self.transform;
	command.tag = self.tag;
	return command;
};
/** @internal */
const fromDescriptor = /*#__PURE__*/ dual((args) => isCommand(args[0]), (descriptor, handler) => {
	const self = makeProto(descriptor, handler ?? ((_) => Effect$1.failSync(() => helpRequested(getDescriptor(self)))), Context.GenericTag(`@effect/cli/Command/(${Arr.fromIterable(getNames(descriptor)).join("|")})`));
	return self;
});
const makeDescriptor = (name, config) => {
	const { args, options, tree } = parseConfig(config);
	return map(make$4(name, all$1(options), all$2(args)), ({ args, options }) => reconstructConfigTree(tree, args, options));
};
/** @internal */
const make$2 = (name, config = {}, handler) => fromDescriptor(makeDescriptor(name, config), handler);
/** @internal */
const withSubcommands$1 = /*#__PURE__*/ dual(2, (self, subcommands) => {
	const command = withSubcommands$2(self.descriptor, Arr.map(subcommands, (_) => [_.tag, _.descriptor]));
	const subcommandMap = Arr.reduce(subcommands, /* @__PURE__ */ new Map(), (handlers, subcommand) => {
		handlers.set(subcommand.tag, subcommand);
		registeredDescriptors.set(subcommand.tag, subcommand.descriptor);
		return handlers;
	});
	function handler(args) {
		if (args.subcommand._tag === "Some") {
			const [tag, value] = args.subcommand.value;
			const subcommand = subcommandMap.get(tag);
			const subcommandEffect = subcommand.transform(subcommand.handler(value), value);
			return Effect$1.provideService(subcommandEffect, self.tag, args);
		}
		return self.handler(args);
	}
	return makeDerive(self, {
		descriptor: command,
		handler
	});
});
/** @internal */
const run$1 = /*#__PURE__*/ dual(2, (self, config) => {
	const app = make$3({
		...config,
		command: self.descriptor
	});
	registeredDescriptors.set(self.tag, self.descriptor);
	const handler = (args) => self.transform(self.handler(args), args);
	return (args) => run$2(app, args, handler);
});
//#endregion
//#region ../../node_modules/.bun/@effect+cli@0.77.2+74e017304edf4bf0/node_modules/@effect/cli/dist/esm/Command.js
/**
* @since 1.0.0
* @category constructors
*/
const make$1 = make$2;
/**
* @since 1.0.0
* @category combinators
*/
const withSubcommands = withSubcommands$1;
/**
* @since 1.0.0
* @category conversions
*/
const run = run$1;
//#endregion
//#region ../../node_modules/.bun/@effect+platform@0.97.2+452b06a93f937da4/node_modules/@effect/platform/dist/esm/Transferable.js
/**
* @since 1.0.0
*/
/**
* @since 1.0.0
* @category tags
*/
var Collector = class extends (/*#__PURE__*/ Context.Tag("@effect/platform/Transferable/Collector")()) {};
/**
* @since 1.0.0
* @category constructors
*/
const unsafeMakeCollector = () => {
	let tranferables = [];
	const unsafeAddAll = (transfers) => {
		tranferables.push(...transfers);
	};
	const unsafeRead = () => tranferables;
	const unsafeClear = () => {
		const prev = tranferables;
		tranferables = [];
		return prev;
	};
	return Collector.of({
		unsafeAddAll,
		addAll: (transferables) => Effect$1.sync(() => unsafeAddAll(transferables)),
		unsafeRead,
		read: Effect$1.sync(unsafeRead),
		unsafeClear,
		clear: Effect$1.sync(unsafeClear)
	});
};
//#endregion
//#region ../../node_modules/.bun/@effect+platform@0.97.2+452b06a93f937da4/node_modules/@effect/platform/dist/esm/WorkerError.js
/**
* @since 1.0.0
* @category type ids
*/
const WorkerErrorTypeId = /* @__PURE__ */ Symbol.for("@effect/platform/WorkerError");
/**
* @since 1.0.0
* @category errors
*/
var WorkerError = class extends (/*#__PURE__*/ Schema.TaggedError()("WorkerError", {
	reason: /*#__PURE__*/ Schema.Literal("spawn", "decode", "send", "unknown", "encode"),
	cause: Schema.Defect
})) {
	/**
	* @since 1.0.0
	*/
	[WorkerErrorTypeId] = WorkerErrorTypeId;
	/**
	* @since 1.0.0
	*/
	static Cause = /*#__PURE__*/ Schema.Cause({
		error: this,
		defect: Schema.Defect
	});
	/**
	* @since 1.0.0
	*/
	static encodeCause = /*#__PURE__*/ Schema.encodeSync(this.Cause);
	/**
	* @since 1.0.0
	*/
	static decodeCause = /*#__PURE__*/ Schema.decodeSync(this.Cause);
	/**
	* @since 1.0.0
	*/
	get message() {
		switch (this.reason) {
			case "send": return "An error occurred calling .postMessage";
			case "spawn": return "An error occurred while spawning a worker";
			case "decode": return "An error occurred during decoding";
			case "encode": return "An error occurred during encoding";
			case "unknown": return "An unexpected error occurred";
		}
	}
};
//#endregion
//#region ../../node_modules/.bun/@effect+platform@0.97.2+452b06a93f937da4/node_modules/@effect/platform/dist/esm/internal/worker.js
/** @internal */
const PlatformWorkerTypeId = /*#__PURE__*/ Symbol.for("@effect/platform/Worker/PlatformWorker");
/** @internal */
const PlatformWorker$1 = /*#__PURE__*/ Context.GenericTag("@effect/platform/Worker/PlatformWorker");
/** @internal */
const WorkerManagerTypeId = /*#__PURE__*/ Symbol.for("@effect/platform/Worker/WorkerManager");
/** @internal */
const WorkerManager = /*#__PURE__*/ Context.GenericTag("@effect/platform/Worker/WorkerManager");
/** @internal */
const Spawner = /*#__PURE__*/ Context.GenericTag("@effect/platform/Worker/Spawner");
/** @internal */
const makeManager = /*#__PURE__*/ Effect$1.gen(function* () {
	const platform = yield* PlatformWorker$1;
	let idCounter = 0;
	return WorkerManager.of({
		[WorkerManagerTypeId]: WorkerManagerTypeId,
		spawn({ encode, initialMessage }) {
			return Effect$1.gen(function* () {
				const id = idCounter++;
				let requestIdCounter = 0;
				const requestMap = /* @__PURE__ */ new Map();
				const collector = unsafeMakeCollector();
				const wrappedEncode = encode ? (message) => Effect$1.zipRight(collector.clear, Effect$1.provideService(encode(message), Collector, collector)) : Effect$1.succeed;
				const readyLatch = yield* Deferred.make();
				const backing = yield* platform.spawn(id);
				yield* backing.run((message) => {
					if (message[0] === 0) return Deferred.complete(readyLatch, Effect$1.void);
					return handleMessage(message[1]);
				}).pipe(Effect$1.onError((cause) => Effect$1.forEach(requestMap.values(), (mailbox) => Deferred.DeferredTypeId in mailbox ? Deferred.failCause(mailbox, cause) : mailbox.failCause(cause))), Effect$1.tapErrorCause(Effect$1.logWarning), Effect$1.retry(Schedule.spaced(1e3)), Effect$1.annotateLogs({
					package: "@effect/platform",
					module: "Worker"
				}), Effect$1.interruptible, Effect$1.forkScoped);
				yield* Effect$1.addFinalizer(() => Effect$1.zipRight(Effect$1.forEach(requestMap.values(), (mailbox) => Deferred.DeferredTypeId in mailbox ? Deferred.interrupt(mailbox) : mailbox.end, { discard: true }), Effect$1.sync(() => requestMap.clear())));
				const handleMessage = (response) => Effect$1.suspend(() => {
					const mailbox = requestMap.get(response[0]);
					if (!mailbox) return Effect$1.void;
					switch (response[1]) {
						case 0: return Deferred.DeferredTypeId in mailbox ? Deferred.succeed(mailbox, response[2][0]) : mailbox.offerAll(response[2]);
						case 1:
							if (response.length === 2) return Deferred.DeferredTypeId in mailbox ? Deferred.interrupt(mailbox) : mailbox.end;
							return Deferred.DeferredTypeId in mailbox ? Deferred.succeed(mailbox, response[2][0]) : Effect$1.zipRight(mailbox.offerAll(response[2]), mailbox.end);
						case 2:
						case 3: {
							if (response[1] === 2) return Deferred.DeferredTypeId in mailbox ? Deferred.fail(mailbox, response[2]) : mailbox.fail(response[2]);
							const cause = WorkerError.decodeCause(response[2]);
							return Deferred.DeferredTypeId in mailbox ? Deferred.failCause(mailbox, cause) : mailbox.failCause(cause);
						}
					}
				});
				const executeAcquire = (request, makeMailbox) => Effect$1.withFiberRuntime((fiber) => {
					const context = fiber.getFiberRef(FiberRef.currentContext);
					const span = Context.getOption(context, Tracer.ParentSpan).pipe(Option$1.filter((span) => span._tag === "Span"));
					const id = requestIdCounter++;
					return makeMailbox.pipe(Effect$1.tap((mailbox) => {
						requestMap.set(id, mailbox);
						return wrappedEncode(request).pipe(Effect$1.tap((payload) => backing.send([
							id,
							0,
							payload,
							span._tag === "Some" ? [
								span.value.traceId,
								span.value.spanId,
								span.value.sampled
							] : void 0
						], collector.unsafeRead())), Effect$1.catchAllCause((cause) => Mailbox.isMailbox(mailbox) ? mailbox.failCause(cause) : Deferred.failCause(mailbox, cause)));
					}), Effect$1.map((mailbox) => ({
						id,
						mailbox
					})));
				});
				const executeRelease = ({ id }, exit) => {
					const release = Effect$1.sync(() => requestMap.delete(id));
					return Exit$1.isFailure(exit) ? Effect$1.zipRight(Effect$1.orDie(backing.send([id, 1])), release) : release;
				};
				const execute = (request) => Stream.fromChannel(Channel.acquireUseRelease(executeAcquire(request, Mailbox.make()), ({ mailbox }) => Mailbox.toChannel(mailbox), executeRelease));
				const executeEffect = (request) => Effect$1.acquireUseRelease(executeAcquire(request, Deferred.make()), ({ mailbox }) => Deferred.await(mailbox), executeRelease);
				yield* Deferred.await(readyLatch);
				if (initialMessage) yield* Effect$1.sync(initialMessage).pipe(Effect$1.flatMap(executeEffect), Effect$1.mapError((cause) => new WorkerError({
					reason: "spawn",
					cause
				})));
				return {
					id,
					execute,
					executeEffect
				};
			});
		}
	});
});
/** @internal */
const layerManager$3 = /*#__PURE__*/ Layer.effect(WorkerManager, makeManager);
/** @internal */
const makePlatform$1 = () => (options) => PlatformWorker$1.of({
	[PlatformWorkerTypeId]: PlatformWorkerTypeId,
	spawn(id) {
		return Effect$1.gen(function* () {
			const spawn = yield* Spawner;
			let currentPort;
			const buffer = [];
			const run = (handler) => Effect$1.uninterruptibleMask((restore) => Effect$1.gen(function* () {
				const scope = yield* Effect$1.scope;
				const port = yield* options.setup({
					worker: spawn(id),
					scope
				});
				currentPort = port;
				yield* Scope$1.addFinalizer(scope, Effect$1.sync(() => {
					currentPort = void 0;
				}));
				const runtime = (yield* Effect$1.runtime()).pipe(Runtime.updateContext(Context.omit(Scope$1.Scope)));
				const fiberSet = yield* FiberSet.make();
				const runFork = Runtime.runFork(runtime);
				yield* options.listen({
					port,
					scope,
					emit(data) {
						FiberSet.unsafeAdd(fiberSet, runFork(handler(data)));
					},
					deferred: fiberSet.deferred
				});
				if (buffer.length > 0) {
					for (const [message, transfers] of buffer) port.postMessage([0, message], transfers);
					buffer.length = 0;
				}
				return yield* restore(FiberSet.join(fiberSet));
			}).pipe(Effect$1.scoped));
			const send = (message, transfers) => Effect$1.try({
				try: () => {
					if (currentPort === void 0) buffer.push([message, transfers]);
					else currentPort.postMessage([0, message], transfers);
				},
				catch: (cause) => new WorkerError({
					reason: "send",
					cause
				})
			});
			return {
				run,
				send
			};
		});
	}
});
//#endregion
//#region ../../node_modules/.bun/@effect+platform@0.97.2+452b06a93f937da4/node_modules/@effect/platform/dist/esm/Worker.js
/**
* @since 1.0.0
*/
const makePlatform = makePlatform$1;
/**
* @since 1.0.0
* @category tags
*/
const PlatformWorker = PlatformWorker$1;
/**
* @since 1.0.0
* @category layers
*/
const layerManager$2 = layerManager$3;
//#endregion
//#region ../../node_modules/.bun/@effect+platform@0.97.2+452b06a93f937da4/node_modules/@effect/platform/dist/esm/internal/effectify.js
/** @internal */
const effectify$1 = (fn, onError, onSyncError) => (...args) => Effect$1.async((resume) => {
	try {
		fn(...args, (err, result) => {
			if (err) resume(Effect$1.fail(onError ? onError(err, args) : err));
			else resume(Effect$1.succeed(result));
		});
	} catch (err) {
		resume(onSyncError ? Effect$1.fail(onSyncError(err, args)) : Effect$1.die(err));
	}
});
//#endregion
//#region ../../node_modules/.bun/@effect+platform@0.97.2+452b06a93f937da4/node_modules/@effect/platform/dist/esm/Effectify.js
/**
* @since 1.0.0
*/
const effectify = effectify$1;
//#endregion
//#region ../../node_modules/.bun/@effect+platform-node-shared@0.61.1+1edbab697a2570fc/node_modules/@effect/platform-node-shared/dist/esm/internal/error.js
/** @internal */
const handleErrnoException = (module, method) => (err, [path]) => {
	let reason = "Unknown";
	switch (err.code) {
		case "ENOENT":
			reason = "NotFound";
			break;
		case "EACCES":
			reason = "PermissionDenied";
			break;
		case "EEXIST":
			reason = "AlreadyExists";
			break;
		case "EISDIR":
			reason = "BadResource";
			break;
		case "ENOTDIR":
			reason = "BadResource";
			break;
		case "EBUSY":
			reason = "Busy";
			break;
		case "ELOOP": reason = "BadResource";
	}
	return new SystemError({
		reason,
		module,
		method,
		pathOrDescriptor: path,
		syscall: err.syscall,
		description: err.message,
		cause: err
	});
};
//#endregion
//#region ../../node_modules/.bun/@effect+platform-node-shared@0.61.1+1edbab697a2570fc/node_modules/@effect/platform-node-shared/dist/esm/internal/fileSystem.js
const handleBadArgument = (method) => (cause) => new BadArgument({
	module: "FileSystem",
	method,
	cause
});
const access = /*#__PURE__*/ (() => {
	const nodeAccess = /*#__PURE__*/ effectify(NFS.access, /*#__PURE__*/ handleErrnoException("FileSystem", "access"), /*#__PURE__*/ handleBadArgument("access"));
	return (path, options) => {
		let mode = NFS.constants.F_OK;
		if (options?.readable) mode |= NFS.constants.R_OK;
		if (options?.writable) mode |= NFS.constants.W_OK;
		return nodeAccess(path, mode);
	};
})();
const copy = /*#__PURE__*/ (() => {
	const nodeCp = /*#__PURE__*/ effectify(NFS.cp, /*#__PURE__*/ handleErrnoException("FileSystem", "copy"), /*#__PURE__*/ handleBadArgument("copy"));
	return (fromPath, toPath, options) => nodeCp(fromPath, toPath, {
		force: options?.overwrite ?? false,
		preserveTimestamps: options?.preserveTimestamps ?? false,
		recursive: true
	});
})();
const copyFile$1 = /*#__PURE__*/ (() => {
	const nodeCopyFile = /*#__PURE__*/ effectify(NFS.copyFile, /*#__PURE__*/ handleErrnoException("FileSystem", "copyFile"), /*#__PURE__*/ handleBadArgument("copyFile"));
	return (fromPath, toPath) => nodeCopyFile(fromPath, toPath);
})();
const chmod = /*#__PURE__*/ (() => {
	const nodeChmod = /*#__PURE__*/ effectify(NFS.chmod, /*#__PURE__*/ handleErrnoException("FileSystem", "chmod"), /*#__PURE__*/ handleBadArgument("chmod"));
	return (path, mode) => nodeChmod(path, mode);
})();
const chown = /*#__PURE__*/ (() => {
	const nodeChown = /*#__PURE__*/ effectify(NFS.chown, /*#__PURE__*/ handleErrnoException("FileSystem", "chown"), /*#__PURE__*/ handleBadArgument("chown"));
	return (path, uid, gid) => nodeChown(path, uid, gid);
})();
const link = /*#__PURE__*/ (() => {
	const nodeLink = /*#__PURE__*/ effectify(NFS.link, /*#__PURE__*/ handleErrnoException("FileSystem", "link"), /*#__PURE__*/ handleBadArgument("link"));
	return (existingPath, newPath) => nodeLink(existingPath, newPath);
})();
const makeDirectory = /*#__PURE__*/ (() => {
	const nodeMkdir = /*#__PURE__*/ effectify(NFS.mkdir, /*#__PURE__*/ handleErrnoException("FileSystem", "makeDirectory"), /*#__PURE__*/ handleBadArgument("makeDirectory"));
	return (path, options) => nodeMkdir(path, {
		recursive: options?.recursive ?? false,
		mode: options?.mode
	});
})();
const makeTempDirectoryFactory = (method) => {
	const nodeMkdtemp = effectify(NFS.mkdtemp, handleErrnoException("FileSystem", method), handleBadArgument(method));
	return (options) => Effect$1.suspend(() => {
		const prefix = options?.prefix ?? "";
		const directory = typeof options?.directory === "string" ? Path.join(options.directory, ".") : OS.tmpdir();
		return nodeMkdtemp(prefix ? Path.join(directory, prefix) : directory + "/");
	});
};
const makeTempDirectory = /*#__PURE__*/ makeTempDirectoryFactory("makeTempDirectory");
const removeFactory = (method) => {
	const nodeRm = effectify(NFS.rm, handleErrnoException("FileSystem", method), handleBadArgument(method));
	return (path, options) => nodeRm(path, {
		recursive: options?.recursive ?? false,
		force: options?.force ?? false
	});
};
const remove = /*#__PURE__*/ removeFactory("remove");
const makeTempDirectoryScoped = /*#__PURE__*/ (() => {
	const makeDirectory = /*#__PURE__*/ makeTempDirectoryFactory("makeTempDirectoryScoped");
	const removeDirectory = /*#__PURE__*/ removeFactory("makeTempDirectoryScoped");
	return (options) => Effect$1.acquireRelease(makeDirectory(options), (directory) => Effect$1.orDie(removeDirectory(directory, { recursive: true })));
})();
const openFactory = (method) => {
	const nodeOpen = effectify(NFS.open, handleErrnoException("FileSystem", method), handleBadArgument(method));
	const nodeClose = effectify(NFS.close, handleErrnoException("FileSystem", method), handleBadArgument(method));
	return (path, options) => pipe(Effect$1.acquireRelease(nodeOpen(path, options?.flag ?? "r", options?.mode), (fd) => Effect$1.orDie(nodeClose(fd))), Effect$1.map((fd) => makeFile(FileDescriptor(fd), options?.flag?.startsWith("a") ?? false)));
};
const open = /*#__PURE__*/ openFactory("open");
const makeFile = /*#__PURE__*/ (() => {
	const nodeReadFactory = (method) => effectify(NFS.read, handleErrnoException("FileSystem", method), handleBadArgument(method));
	const nodeRead = /*#__PURE__*/ nodeReadFactory("read");
	const nodeReadAlloc = /*#__PURE__*/ nodeReadFactory("readAlloc");
	const nodeStat = /*#__PURE__*/ effectify(NFS.fstat, /*#__PURE__*/ handleErrnoException("FileSystem", "stat"), /*#__PURE__*/ handleBadArgument("stat"));
	const nodeTruncate = /*#__PURE__*/ effectify(NFS.ftruncate, /*#__PURE__*/ handleErrnoException("FileSystem", "truncate"), /*#__PURE__*/ handleBadArgument("truncate"));
	const nodeSync = /*#__PURE__*/ effectify(NFS.fsync, /*#__PURE__*/ handleErrnoException("FileSystem", "sync"), /*#__PURE__*/ handleBadArgument("sync"));
	const nodeWriteFactory = (method) => effectify(NFS.write, handleErrnoException("FileSystem", method), handleBadArgument(method));
	const nodeWrite = /*#__PURE__*/ nodeWriteFactory("write");
	const nodeWriteAll = /*#__PURE__*/ nodeWriteFactory("writeAll");
	class FileImpl {
		fd;
		append;
		[FileTypeId];
		semaphore = /*#__PURE__*/ Effect$1.unsafeMakeSemaphore(1);
		position = 0n;
		constructor(fd, append) {
			this.fd = fd;
			this.append = append;
			this[FileTypeId] = FileTypeId;
		}
		get stat() {
			return Effect$1.map(nodeStat(this.fd), makeFileInfo);
		}
		get sync() {
			return nodeSync(this.fd);
		}
		seek(offset, from) {
			const offsetSize = Size(offset);
			return this.semaphore.withPermits(1)(Effect$1.sync(() => {
				if (from === "start") this.position = offsetSize;
				else if (from === "current") this.position = this.position + offsetSize;
				return this.position;
			}));
		}
		read(buffer) {
			return this.semaphore.withPermits(1)(Effect$1.map(Effect$1.suspend(() => nodeRead(this.fd, {
				buffer,
				position: this.position
			})), (bytesRead) => {
				const sizeRead = Size(bytesRead);
				this.position = this.position + sizeRead;
				return sizeRead;
			}));
		}
		readAlloc(size) {
			const sizeNumber = Number(size);
			return this.semaphore.withPermits(1)(Effect$1.flatMap(Effect$1.sync(() => Buffer.allocUnsafeSlow(sizeNumber)), (buffer) => Effect$1.map(nodeReadAlloc(this.fd, {
				buffer,
				position: this.position
			}), (bytesRead) => {
				if (bytesRead === 0) return Option$1.none();
				this.position = this.position + BigInt(bytesRead);
				if (bytesRead === sizeNumber) return Option$1.some(buffer);
				const dst = Buffer.allocUnsafeSlow(bytesRead);
				buffer.copy(dst, 0, 0, bytesRead);
				return Option$1.some(dst);
			})));
		}
		truncate(length) {
			return this.semaphore.withPermits(1)(Effect$1.map(nodeTruncate(this.fd, length ? Number(length) : void 0), () => {
				if (!this.append) {
					const len = BigInt(length ?? 0);
					if (this.position > len) this.position = len;
				}
			}));
		}
		write(buffer) {
			return this.semaphore.withPermits(1)(Effect$1.map(Effect$1.suspend(() => nodeWrite(this.fd, buffer, void 0, void 0, this.append ? void 0 : Number(this.position))), (bytesWritten) => {
				const sizeWritten = Size(bytesWritten);
				if (!this.append) this.position = this.position + sizeWritten;
				return sizeWritten;
			}));
		}
		writeAllChunk(buffer) {
			return Effect$1.flatMap(Effect$1.suspend(() => nodeWriteAll(this.fd, buffer, void 0, void 0, this.append ? void 0 : Number(this.position))), (bytesWritten) => {
				if (bytesWritten === 0) return Effect$1.fail(new SystemError({
					module: "FileSystem",
					method: "writeAll",
					reason: "WriteZero",
					pathOrDescriptor: this.fd,
					description: "write returned 0 bytes written"
				}));
				if (!this.append) this.position = this.position + BigInt(bytesWritten);
				return bytesWritten < buffer.length ? this.writeAllChunk(buffer.subarray(bytesWritten)) : Effect$1.void;
			});
		}
		writeAll(buffer) {
			return this.semaphore.withPermits(1)(this.writeAllChunk(buffer));
		}
	}
	return (fd, append) => new FileImpl(fd, append);
})();
const makeTempFileFactory = (method) => {
	const makeDirectory = makeTempDirectoryFactory(method);
	const open = openFactory(method);
	const randomHexString = (bytes) => Effect$1.sync(() => Crypto.randomBytes(bytes).toString("hex"));
	return (options) => pipe(Effect$1.zip(makeDirectory(options), randomHexString(6)), Effect$1.map(([directory, random]) => Path.join(directory, random + (options?.suffix ?? ""))), Effect$1.tap((path) => Effect$1.scoped(open(path, { flag: "w+" }))));
};
const makeTempFile = /*#__PURE__*/ makeTempFileFactory("makeTempFile");
const makeTempFileScoped = /*#__PURE__*/ (() => {
	const makeFile = /*#__PURE__*/ makeTempFileFactory("makeTempFileScoped");
	const removeDirectory = /*#__PURE__*/ removeFactory("makeTempFileScoped");
	return (options) => Effect$1.acquireRelease(makeFile(options), (file) => Effect$1.orDie(removeDirectory(Path.dirname(file), { recursive: true })));
})();
const readDirectory = (path, options) => Effect$1.tryPromise({
	try: () => NFS.promises.readdir(path, options),
	catch: (err) => handleErrnoException("FileSystem", "readDirectory")(err, [path])
});
const readFile$1 = (path) => Effect$1.async((resume, signal) => {
	try {
		NFS.readFile(path, { signal }, (err, data) => {
			if (err) resume(Effect$1.fail(handleErrnoException("FileSystem", "readFile")(err, [path])));
			else resume(Effect$1.succeed(data));
		});
	} catch (err) {
		resume(Effect$1.fail(handleBadArgument("readFile")(err)));
	}
});
const readLink = /*#__PURE__*/ (() => {
	const nodeReadLink = /*#__PURE__*/ effectify(NFS.readlink, /*#__PURE__*/ handleErrnoException("FileSystem", "readLink"), /*#__PURE__*/ handleBadArgument("readLink"));
	return (path) => nodeReadLink(path);
})();
const realPath = /*#__PURE__*/ (() => {
	const nodeRealPath = /*#__PURE__*/ effectify(NFS.realpath, /*#__PURE__*/ handleErrnoException("FileSystem", "realPath"), /*#__PURE__*/ handleBadArgument("realPath"));
	return (path) => nodeRealPath(path);
})();
const rename$1 = /*#__PURE__*/ (() => {
	const nodeRename = /*#__PURE__*/ effectify(NFS.rename, /*#__PURE__*/ handleErrnoException("FileSystem", "rename"), /*#__PURE__*/ handleBadArgument("rename"));
	return (oldPath, newPath) => nodeRename(oldPath, newPath);
})();
const makeFileInfo = (stat) => ({
	type: stat.isFile() ? "File" : stat.isDirectory() ? "Directory" : stat.isSymbolicLink() ? "SymbolicLink" : stat.isBlockDevice() ? "BlockDevice" : stat.isCharacterDevice() ? "CharacterDevice" : stat.isFIFO() ? "FIFO" : stat.isSocket() ? "Socket" : "Unknown",
	mtime: Option$1.fromNullable(stat.mtime),
	atime: Option$1.fromNullable(stat.atime),
	birthtime: Option$1.fromNullable(stat.birthtime),
	dev: stat.dev,
	rdev: Option$1.fromNullable(stat.rdev),
	ino: Option$1.fromNullable(stat.ino),
	mode: stat.mode,
	nlink: Option$1.fromNullable(stat.nlink),
	uid: Option$1.fromNullable(stat.uid),
	gid: Option$1.fromNullable(stat.gid),
	size: Size(stat.size),
	blksize: Option$1.map(Option$1.fromNullable(stat.blksize), Size),
	blocks: Option$1.fromNullable(stat.blocks)
});
const stat$1 = /*#__PURE__*/ (() => {
	const nodeStat = /*#__PURE__*/ effectify(NFS.stat, /*#__PURE__*/ handleErrnoException("FileSystem", "stat"), /*#__PURE__*/ handleBadArgument("stat"));
	return (path) => Effect$1.map(nodeStat(path), makeFileInfo);
})();
const symlink = /*#__PURE__*/ (() => {
	const nodeSymlink = /*#__PURE__*/ effectify(NFS.symlink, /*#__PURE__*/ handleErrnoException("FileSystem", "symlink"), /*#__PURE__*/ handleBadArgument("symlink"));
	return (target, path) => nodeSymlink(target, path);
})();
const truncate = /*#__PURE__*/ (() => {
	const nodeTruncate = /*#__PURE__*/ effectify(NFS.truncate, /*#__PURE__*/ handleErrnoException("FileSystem", "truncate"), /*#__PURE__*/ handleBadArgument("truncate"));
	return (path, length) => nodeTruncate(path, length !== void 0 ? Number(length) : void 0);
})();
const utimes = /*#__PURE__*/ (() => {
	const nodeUtimes = /*#__PURE__*/ effectify(NFS.utimes, /*#__PURE__*/ handleErrnoException("FileSystem", "utime"), /*#__PURE__*/ handleBadArgument("utime"));
	return (path, atime, mtime) => nodeUtimes(path, atime, mtime);
})();
const watchNode = (path, options) => Stream.asyncScoped((emit) => Effect$1.acquireRelease(Effect$1.sync(() => {
	const watcher = NFS.watch(path, { recursive: options?.recursive }, (event, path) => {
		if (!path) return;
		switch (event) {
			case "rename":
				emit.fromEffect(Effect$1.matchEffect(stat$1(path), {
					onSuccess: (_) => Effect$1.succeed(WatchEventCreate({ path })),
					onFailure: (err) => err._tag === "SystemError" && err.reason === "NotFound" ? Effect$1.succeed(WatchEventRemove({ path })) : Effect$1.fail(err)
				}));
				return;
			case "change":
				emit.single(WatchEventUpdate({ path }));
				return;
		}
	});
	watcher.on("error", (error) => {
		emit.fail(new SystemError({
			module: "FileSystem",
			reason: "Unknown",
			method: "watch",
			pathOrDescriptor: path,
			cause: error
		}));
	});
	watcher.on("close", () => {
		emit.end();
	});
	return watcher;
}), (watcher) => Effect$1.sync(() => watcher.close())));
const watch = (backend, path, options) => stat$1(path).pipe(Effect$1.map((stat) => backend.pipe(Option$1.flatMap((_) => _.register(path, stat, options)), Option$1.getOrElse(() => watchNode(path, options)))), Stream.unwrap);
const writeFile$1 = (path, data, options) => Effect$1.async((resume, signal) => {
	try {
		NFS.writeFile(path, data, {
			signal,
			flag: options?.flag,
			mode: options?.mode
		}, (err) => {
			if (err) resume(Effect$1.fail(handleErrnoException("FileSystem", "writeFile")(err, [path])));
			else resume(Effect$1.void);
		});
	} catch (err) {
		resume(Effect$1.fail(handleBadArgument("writeFile")(err)));
	}
});
const makeFileSystem = /*#__PURE__*/ Effect$1.map(/*#__PURE__*/ Effect$1.serviceOption(WatchBackend), (backend) => make$7({
	access,
	chmod,
	chown,
	copy,
	copyFile: copyFile$1,
	link,
	makeDirectory,
	makeTempDirectory,
	makeTempDirectoryScoped,
	makeTempFile,
	makeTempFileScoped,
	open,
	readDirectory,
	readFile: readFile$1,
	readLink,
	realPath,
	remove,
	rename: rename$1,
	stat: stat$1,
	symlink,
	truncate,
	utimes,
	watch(path, options) {
		return watch(backend, path, options);
	},
	writeFile: writeFile$1
}));
//#endregion
//#region ../../node_modules/.bun/@effect+platform-node-shared@0.61.1+1edbab697a2570fc/node_modules/@effect/platform-node-shared/dist/esm/NodeFileSystem.js
/**
* @since 1.0.0
*/
/**
* @since 1.0.0
* @category layer
*/
const layer$7 = /* @__PURE__ */ Layer.effect(FileSystem, makeFileSystem);
//#endregion
//#region ../../node_modules/.bun/@effect+platform-node-shared@0.61.1+1edbab697a2570fc/node_modules/@effect/platform-node-shared/dist/esm/internal/stream.js
/** @internal */
const fromReadable = (evaluate, onError, options) => Stream.fromChannel(fromReadableChannel(evaluate, onError, options));
/** @internal */
const fromReadableChannel = (evaluate, onError, options) => Channel.suspend(() => unsafeReadableRead(evaluate(), onError, MutableRef.make(void 0), options));
/** @internal */
const writeInput = (writable, onFailure, { encoding, endOnDone = true } = {}, onDone = Effect$1.void) => {
	const write = writeEffect(writable, encoding);
	const close = endOnDone ? Effect$1.async((resume) => {
		if ("closed" in writable && writable.closed) resume(Effect$1.void);
		else {
			writable.once("finish", () => resume(Effect$1.void));
			writable.end();
		}
	}) : Effect$1.void;
	return {
		awaitRead: () => Effect$1.void,
		emit: write,
		error: (cause) => Effect$1.zipRight(close, onFailure(cause)),
		done: (_) => Effect$1.zipRight(close, onDone)
	};
};
/** @internal */
const writeEffect = (writable, encoding) => (chunk) => chunk.length === 0 ? Effect$1.void : Effect$1.async((resume) => {
	const iterator = chunk[Symbol.iterator]();
	let next = iterator.next();
	function loop() {
		const item = next;
		next = iterator.next();
		const success = writable.write(item.value, encoding);
		if (next.done) resume(Effect$1.void);
		else if (success) loop();
		else writable.once("drain", loop);
	}
	loop();
});
const unsafeReadableRead = (readable, onError, exit, options) => {
	if (!readable.readable) return Channel.void;
	const latch = Effect$1.unsafeMakeLatch(false);
	function onReadable() {
		latch.unsafeOpen();
	}
	function onErr(err) {
		exit.current = Exit$1.fail(onError(err));
		latch.unsafeOpen();
	}
	function onEnd() {
		exit.current = Exit$1.void;
		latch.unsafeOpen();
	}
	readable.on("readable", onReadable);
	readable.on("error", onErr);
	readable.on("end", onEnd);
	const chunkSize = options?.chunkSize ? Number(options.chunkSize) : void 0;
	const read = Channel.suspend(function loop() {
		let item = readable.read(chunkSize);
		if (item === null) {
			if (exit.current) return Channel.fromEffect(exit.current);
			latch.unsafeClose();
			return Channel.flatMap(latch.await, loop);
		}
		const arr = [item];
		while (true) {
			item = readable.read(chunkSize);
			if (item === null) return Channel.flatMap(Channel.write(Chunk.unsafeFromArray(arr)), loop);
			arr.push(item);
		}
	});
	return Channel.ensuring(read, Effect$1.sync(() => {
		readable.off("readable", onReadable);
		readable.off("error", onErr);
		readable.off("end", onEnd);
		if (options?.closeOnDone !== false && "closed" in readable && !readable.closed) readable.destroy();
	}));
};
//#endregion
//#region ../../node_modules/.bun/@effect+platform-node-shared@0.61.1+1edbab697a2570fc/node_modules/@effect/platform-node-shared/dist/esm/internal/sink.js
/** @internal */
const fromWritable = (evaluate, onError, options) => Sink.fromChannel(fromWritableChannel(evaluate, onError, options));
/** @internal */
const fromWritableChannel = (writable, onError, options) => Channel.flatMap(Effect$1.zip(Effect$1.sync(() => writable()), Deferred.make()), ([writable, deferred]) => Channel.embedInput(writableOutput(writable, deferred, onError), writeInput(writable, (cause) => Deferred.failCause(deferred, cause), options, Deferred.complete(deferred, Effect$1.void))));
const writableOutput = (writable, deferred, onError) => Effect$1.suspend(() => {
	function handleError(err) {
		Deferred.unsafeDone(deferred, Effect$1.fail(onError(err)));
	}
	writable.on("error", handleError);
	return Effect$1.ensuring(Deferred.await(deferred), Effect$1.sync(() => {
		writable.removeListener("error", handleError);
	}));
});
//#endregion
//#region ../../node_modules/.bun/@effect+platform@0.97.2+452b06a93f937da4/node_modules/@effect/platform/dist/esm/internal/commandExecutor.js
/** @internal */
const TypeId = /*#__PURE__*/ Symbol.for("@effect/platform/CommandExecutor");
/** @internal */
const ProcessTypeId$1 = /*#__PURE__*/ Symbol.for("@effect/platform/Process");
/** @internal */
const ExitCode$1 = /*#__PURE__*/ Brand.nominal();
/** @internal */
const ProcessId$1 = /*#__PURE__*/ Brand.nominal();
/** @internal */
const CommandExecutor$1 = /*#__PURE__*/ GenericTag("@effect/platform/CommandExecutor");
/** @internal */
const makeExecutor$1 = (start) => {
	const stream = (command) => Stream.unwrapScoped(Effect$1.map(start(command), (process) => process.stdout));
	const streamLines = (command, encoding) => {
		const decoder = new TextDecoder(encoding);
		return Stream.splitLines(Stream.mapChunks(stream(command), Chunk.map((bytes) => decoder.decode(bytes))));
	};
	return {
		[TypeId]: TypeId,
		start,
		exitCode: (command) => Effect$1.scoped(Effect$1.flatMap(start(command), (process) => process.exitCode)),
		stream,
		string: (command, encoding = "utf-8") => {
			const decoder = new TextDecoder(encoding);
			return pipe(start(command), Effect$1.flatMap((process) => Stream.run(process.stdout, collectUint8Array)), Effect$1.map((bytes) => decoder.decode(bytes)), Effect$1.scoped);
		},
		lines: (command, encoding = "utf-8") => {
			return pipe(streamLines(command, encoding), Stream.runCollect, Effect$1.map(Chunk.toArray));
		},
		streamLines
	};
};
const collectUint8Array = /*#__PURE__*/ Sink.foldLeftChunks(/*#__PURE__*/ new Uint8Array(), (bytes, chunk) => Chunk.reduce(chunk, bytes, (acc, curr) => {
	const newArray = new Uint8Array(acc.length + curr.length);
	newArray.set(acc);
	newArray.set(curr, acc.length);
	return newArray;
}));
//#endregion
//#region ../../node_modules/.bun/@effect+platform@0.97.2+452b06a93f937da4/node_modules/@effect/platform/dist/esm/internal/command.js
/** @internal */
const CommandTypeId = /*#__PURE__*/ Symbol.for("@effect/platform/Command");
/** @internal */
const flatten$1 = (self) => Array.from(flattenLoop(self));
/** @internal */
const flattenLoop = (self) => {
	switch (self._tag) {
		case "StandardCommand": return Chunk.of(self);
		case "PipedCommand": return Chunk.appendAll(flattenLoop(self.left), flattenLoop(self.right));
	}
};
const Proto = {
	[CommandTypeId]: CommandTypeId,
	pipe() {
		return pipeArguments(this, arguments);
	},
	...Inspectable.BaseProto
};
const StandardProto = {
	...Proto,
	_tag: "StandardCommand",
	toJSON() {
		return {
			_id: "@effect/platform/Command",
			_tag: this._tag,
			command: this.command,
			args: this.args,
			env: Object.fromEntries(this.env),
			extendEnv: this.extendEnv,
			cwd: this.cwd.toJSON(),
			shell: this.shell,
			gid: this.gid.toJSON(),
			uid: this.uid.toJSON()
		};
	}
};
const makeStandard = (options) => Object.assign(Object.create(StandardProto), options);
const PipedProto = {
	...Proto,
	_tag: "PipedCommand",
	toJSON() {
		return {
			_id: "@effect/platform/Command",
			_tag: this._tag,
			left: this.left.toJSON(),
			right: this.right.toJSON()
		};
	}
};
const makePiped = (options) => Object.assign(Object.create(PipedProto), options);
/** @internal */
const stdin$1 = /*#__PURE__*/ dual(2, (self, input) => {
	switch (self._tag) {
		case "StandardCommand": return makeStandard({
			...self,
			stdin: input
		});
		case "PipedCommand": return makePiped({
			...self,
			left: stdin$1(self.left, input)
		});
	}
});
//#endregion
//#region ../../node_modules/.bun/@effect+platform@0.97.2+452b06a93f937da4/node_modules/@effect/platform/dist/esm/Command.js
/**
* Flatten this command to a non-empty array of standard commands.
*
* For a `StandardCommand`, this simply returns a `1` element array
* For a `PipedCommand`, all commands in the pipe will be extracted out into
* a array from left to right
*
* @since 1.0.0
* @category combinators
*/
const flatten = flatten$1;
/**
* Specify the standard input stream for a command.
*
* @since 1.0.0
* @category combinators
*/
const stdin = stdin$1;
//#endregion
//#region ../../node_modules/.bun/@effect+platform@0.97.2+452b06a93f937da4/node_modules/@effect/platform/dist/esm/CommandExecutor.js
/**
* @since 1.0.0
* @category tags
*/
const CommandExecutor = CommandExecutor$1;
/**
* @since 1.0.0
* @category symbols
*/
const ProcessTypeId = ProcessTypeId$1;
/**
* @since 1.0.0
* @category constructors
*/
const ExitCode = ExitCode$1;
/**
* @since 1.0.0
* @category constructors
*/
const ProcessId = ProcessId$1;
/**
* @since 1.0.0
* @category constructors
*/
const makeExecutor = makeExecutor$1;
//#endregion
//#region ../../node_modules/.bun/@effect+platform-node-shared@0.61.1+1edbab697a2570fc/node_modules/@effect/platform-node-shared/dist/esm/internal/commandExecutor.js
const inputToStdioOption = (stdin) => typeof stdin === "string" ? stdin : "pipe";
const outputToStdioOption = (output) => typeof output === "string" ? output : "pipe";
const toError = (err) => err instanceof globalThis.Error ? err : new globalThis.Error(String(err));
const toPlatformError = (method, error, command) => {
	const flattened = flatten(command).reduce((acc, curr) => {
		const command = `${curr.command} ${curr.args.join(" ")}`;
		return acc.length === 0 ? command : `${acc} | ${command}`;
	}, "");
	return handleErrnoException("Command", method)(error, [flattened]);
};
const ProcessProto = {
	[ProcessTypeId]: ProcessTypeId,
	...Inspectable.BaseProto,
	toJSON() {
		return {
			_id: "@effect/platform/CommandExecutor/Process",
			pid: this.pid
		};
	}
};
const runCommand = (fileSystem) => (command) => {
	switch (command._tag) {
		case "StandardCommand": {
			const spawn = Effect$1.flatMap(Deferred.make(), (exitCode) => Effect$1.async((resume) => {
				const handle = ChildProcess.spawn(command.command, command.args, {
					stdio: [
						inputToStdioOption(command.stdin),
						outputToStdioOption(command.stdout),
						outputToStdioOption(command.stderr)
					],
					cwd: Option$1.getOrElse(command.cwd, constUndefined),
					shell: command.shell,
					env: command.extendEnv ? {
						...process.env,
						...Object.fromEntries(command.env)
					} : Object.fromEntries(command.env),
					detached: process.platform !== "win32"
				});
				handle.on("error", (err) => {
					resume(Effect$1.fail(toPlatformError("spawn", err, command)));
				});
				handle.on("exit", (...args) => {
					Deferred.unsafeDone(exitCode, Effect$1.succeed(args));
				});
				handle.on("spawn", () => {
					resume(Effect$1.succeed([handle, exitCode]));
				});
				return Effect$1.sync(() => {
					handle.kill("SIGTERM");
				});
			}));
			const killProcessGroup = process.platform === "win32" ? (handle, _) => Effect$1.async((resume) => {
				ChildProcess.exec(`taskkill /pid ${handle.pid} /T /F`, (error) => {
					if (error) resume(Effect$1.fail(toPlatformError("kill", toError(error), command)));
					else resume(Effect$1.void);
				});
			}) : (handle, signal) => Effect$1.try({
				try: () => process.kill(-handle.pid, signal),
				catch: (error) => toPlatformError("kill", toError(error), command)
			});
			const killProcess = (handle, signal) => Effect$1.suspend(() => handle.kill(signal) ? Effect$1.void : Effect$1.fail(toPlatformError("kill", new globalThis.Error("Failed to kill process"), command)));
			return pipe(Option$1.match(command.cwd, {
				onNone: () => Effect$1.void,
				onSome: (dir) => fileSystem.access(dir)
			}), Effect$1.zipRight(Effect$1.acquireRelease(spawn, ([handle, exitCode]) => Effect$1.flatMap(Deferred.isDone(exitCode), (done) => {
				if (!done) return killProcessGroup(handle, "SIGTERM").pipe(Effect$1.orElse(() => killProcess(handle, "SIGTERM")), Effect$1.zipRight(Deferred.await(exitCode)), Effect$1.ignore);
				return Effect$1.flatMap(Deferred.await(exitCode), ([code]) => {
					if (code !== 0 && code !== null) return killProcessGroup(handle, "SIGTERM").pipe(Effect$1.ignore);
					return Effect$1.void;
				});
			}))), Effect$1.map(([handle, exitCodeDeferred]) => {
				let stdin = Sink.drain;
				if (handle.stdin !== null) stdin = fromWritable(() => handle.stdin, (err) => toPlatformError("toWritable", toError(err), command));
				const exitCode = Effect$1.flatMap(Deferred.await(exitCodeDeferred), ([code, signal]) => {
					if (code !== null) return Effect$1.succeed(ExitCode(code));
					return Effect$1.fail(toPlatformError("exitCode", new globalThis.Error(`Process interrupted due to receipt of signal: ${signal}`), command));
				});
				const isRunning = Effect$1.negate(Deferred.isDone(exitCodeDeferred));
				const kill = (signal = "SIGTERM") => killProcessGroup(handle, signal).pipe(Effect$1.orElse(() => killProcess(handle, signal)), Effect$1.zipRight(Effect$1.asVoid(Deferred.await(exitCodeDeferred))));
				const pid = ProcessId(handle.pid);
				const stderr = fromReadable(() => handle.stderr, (err) => toPlatformError("fromReadable(stderr)", toError(err), command));
				let stdout = fromReadable(() => handle.stdout, (err) => toPlatformError("fromReadable(stdout)", toError(err), command));
				if (typeof command.stdout !== "string") stdout = Stream.transduce(stdout, command.stdout);
				return Object.assign(Object.create(ProcessProto), {
					pid,
					exitCode,
					isRunning,
					kill,
					stdin,
					stderr,
					stdout
				});
			}), typeof command.stdin === "string" ? identity : Effect$1.tap((process) => Effect$1.forkDaemon(Stream.run(command.stdin, process.stdin))));
		}
		case "PipedCommand": {
			const flattened = flatten(command);
			if (flattened.length === 1) return pipe(flattened[0], runCommand(fileSystem));
			const head = flattened[0];
			const tail = flattened.slice(1);
			const initial = tail.slice(0, tail.length - 1);
			const last = tail[tail.length - 1];
			const stream = initial.reduce((stdin$2, command) => pipe(stdin(command, stdin$2), runCommand(fileSystem), Effect$1.map((process) => process.stdout), Stream.unwrapScoped), pipe(runCommand(fileSystem)(head), Effect$1.map((process) => process.stdout), Stream.unwrapScoped));
			return pipe(stdin(last, stream), runCommand(fileSystem));
		}
	}
};
//#endregion
//#region ../../node_modules/.bun/@effect+platform-node-shared@0.61.1+1edbab697a2570fc/node_modules/@effect/platform-node-shared/dist/esm/NodeCommandExecutor.js
/**
* @since 1.0.0
* @category layer
*/
const layer$5 = /* @__PURE__ */ Layer.effect(CommandExecutor, /*#__PURE__*/ pipe(FileSystem, /*#__PURE__*/ Effect$1.map((fileSystem) => makeExecutor(runCommand(fileSystem)))));
//#endregion
//#region ../../node_modules/.bun/@effect+platform-node-shared@0.61.1+1edbab697a2570fc/node_modules/@effect/platform-node-shared/dist/esm/internal/path.js
const fromFileUrl = (url) => Effect$1.try({
	try: () => NodeUrl.fileURLToPath(url),
	catch: (error) => new BadArgument({
		module: "Path",
		method: "fromFileUrl",
		description: `Invalid file URL: ${url}`,
		cause: error
	})
});
const toFileUrl = (path) => Effect$1.try({
	try: () => NodeUrl.pathToFileURL(path),
	catch: (error) => new BadArgument({
		module: "Path",
		method: "toFileUrl",
		description: `Invalid path: ${path}`,
		cause: error
	})
});
({ ...Path.posix });
({ ...Path.win32 });
//#endregion
//#region ../../node_modules/.bun/@effect+platform-node-shared@0.61.1+1edbab697a2570fc/node_modules/@effect/platform-node-shared/dist/esm/NodePath.js
/**
* @since 1.0.0
*/
/**
* @since 1.0.0
* @category layer
*/
const layer$3 = /* @__PURE__ */ Layer.succeed(Path$1, /*#__PURE__*/ Path$1.of({
	[TypeId$3]: TypeId$3,
	...Path,
	fromFileUrl,
	toFileUrl
}));
//#endregion
//#region ../../node_modules/.bun/@effect+platform-node-shared@0.61.1+1edbab697a2570fc/node_modules/@effect/platform-node-shared/dist/esm/internal/terminal.js
const defaultShouldQuit = (input) => input.key.ctrl && (input.key.name === "c" || input.key.name === "d");
/** @internal */
const make = /*#__PURE__*/ Effect$1.fnUntraced(function* (shouldQuit = defaultShouldQuit) {
	const stdin = process.stdin;
	const stdout = process.stdout;
	const rlRef = yield* RcRef.make({ acquire: Effect$1.acquireRelease(Effect$1.sync(() => {
		const rl = readline.createInterface({
			input: stdin,
			escapeCodeTimeout: 50
		});
		readline.emitKeypressEvents(stdin, rl);
		if (stdin.isTTY) stdin.setRawMode(true);
		return rl;
	}), (rl) => Effect$1.sync(() => {
		if (stdin.isTTY) stdin.setRawMode(false);
		rl.close();
	})) });
	const columns = Effect$1.sync(() => stdout.columns ?? 0);
	const rows = Effect$1.sync(() => stdout.rows ?? 0);
	const isTTY = Effect$1.sync(() => Boolean(stdout.isTTY));
	const readInput = Effect$1.gen(function* () {
		yield* RcRef.get(rlRef);
		const mailbox = yield* Mailbox.make();
		const handleKeypress = (s, k) => {
			const userInput = {
				input: Option$1.fromNullable(s),
				key: {
					name: k.name ?? "",
					ctrl: !!k.ctrl,
					meta: !!k.meta,
					shift: !!k.shift
				}
			};
			mailbox.unsafeOffer(userInput);
			if (shouldQuit(userInput)) mailbox.unsafeDone(Exit$1.void);
		};
		yield* Effect$1.addFinalizer(() => Effect$1.sync(() => stdin.off("keypress", handleKeypress)));
		stdin.on("keypress", handleKeypress);
		return mailbox;
	});
	const readLine = RcRef.get(rlRef).pipe(Effect$1.flatMap((readlineInterface) => Effect$1.async((resume) => {
		const onLine = (line) => resume(Effect$1.succeed(line));
		readlineInterface.once("line", onLine);
		return Effect$1.sync(() => readlineInterface.off("line", onLine));
	})), Effect$1.scoped);
	const display = (prompt) => Effect$1.uninterruptible(Effect$1.async((resume) => {
		stdout.write(prompt, (err) => err ? resume(Effect$1.fail(new BadArgument({
			module: "Terminal",
			method: "display",
			description: "Failed to write prompt to stdout",
			cause: err
		}))) : resume(Effect$1.void));
	}));
	return Terminal.of({
		columns,
		rows,
		isTTY,
		readInput,
		readLine,
		display
	});
});
//#endregion
//#region ../../node_modules/.bun/@effect+platform-node-shared@0.61.1+1edbab697a2570fc/node_modules/@effect/platform-node-shared/dist/esm/NodeTerminal.js
/**
* @since 1.0.0
* @category layer
*/
const layer$1 = /* @__PURE__ */ Layer.scoped(Terminal, /*#__PURE__*/ make(defaultShouldQuit));
//#endregion
//#region ../../node_modules/.bun/@effect+platform-node@0.108.2+1edbab697a2570fc/node_modules/@effect/platform-node/dist/esm/internal/worker.js
const platformWorkerImpl = /*#__PURE__*/ makePlatform()({
	setup({ scope, worker }) {
		return Effect$1.flatMap(Deferred.make(), (exitDeferred) => {
			const thing = "postMessage" in worker ? {
				postMessage(msg, t) {
					worker.postMessage(msg, t);
				},
				kill: () => worker.terminate(),
				worker
			} : {
				postMessage(msg, _) {
					worker.send(msg);
				},
				kill: () => worker.kill("SIGKILL"),
				worker
			};
			worker.on("exit", () => {
				Deferred.unsafeDone(exitDeferred, Exit$1.void);
			});
			return Effect$1.as(Scope$1.addFinalizer(scope, Effect$1.suspend(() => {
				thing.postMessage([1]);
				return Deferred.await(exitDeferred);
			}).pipe(Effect$1.interruptible, Effect$1.timeout(5e3), Effect$1.catchAllCause(() => Effect$1.sync(() => thing.kill())))), thing);
		});
	},
	listen({ deferred, emit, port }) {
		port.worker.on("message", (message) => {
			emit(message);
		});
		port.worker.on("messageerror", (cause) => {
			Deferred.unsafeDone(deferred, new WorkerError({
				reason: "decode",
				cause
			}));
		});
		port.worker.on("error", (cause) => {
			Deferred.unsafeDone(deferred, new WorkerError({
				reason: "unknown",
				cause
			}));
		});
		port.worker.on("exit", (code) => {
			Deferred.unsafeDone(deferred, new WorkerError({
				reason: "unknown",
				cause: /* @__PURE__ */ new Error(`exited with code ${code}`)
			}));
		});
		return Effect$1.void;
	}
});
/** @internal */
const layerWorker = /*#__PURE__*/ Layer.succeed(PlatformWorker, platformWorkerImpl);
//#endregion
//#region ../../node_modules/.bun/@effect+platform-node@0.108.2+1edbab697a2570fc/node_modules/@effect/platform-node/dist/esm/NodeWorker.js
/**
* @since 1.0.0
* @category layers
*/
const layerManager = /* @__PURE__ */ Layer.provide(layerManager$2, layerWorker);
//#endregion
//#region ../../node_modules/.bun/@effect+platform-node@0.108.2+1edbab697a2570fc/node_modules/@effect/platform-node/dist/esm/NodeContext.js
/**
* @since 1.0.0
*/
/**
* @since 1.0.0
* @category layer
*/
const layer = /*#__PURE__*/ pipe(/*#__PURE__*/ Layer.mergeAll(layer$3, layer$5, layer$1, layerManager), /*#__PURE__*/ Layer.provideMerge(layer$7));
//#endregion
//#region ../cli/src/dashboard-matrix.ts
/** Dashboard submissions are intentionally one explicit, configured cell at a time. */
function selectDashboardCell(matrix, evalId, parameters) {
	if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) throw new Error("Select one value for every matrix axis");
	const provided = parameters;
	const axes = Object.keys(matrix.parameters);
	if (Object.keys(provided).length !== axes.length || axes.some((axis) => !Object.hasOwn(provided, axis))) throw new Error("Select one value for every matrix axis");
	const selected = {};
	for (const axis of axes) {
		const value = provided[axis];
		if (!matrix.parameters[axis].some((choice) => canonicalParameters(choice) === canonicalParameters(value))) throw new Error(`Unknown ${axis} value`);
		selected[axis] = [value];
	}
	const selection = {
		evals: [evalId],
		parameters: selected
	};
	if (matrix.count(selection) !== 1) throw new Error("Selection must contain exactly one cell");
	return selection;
}
//#endregion
//#region ../cli/src/project.ts
const defaultInclude = ["**/*.eval.ts", "**/*.eval.js"];
const defaultExclude = [
	"**/node_modules/**",
	"**/.git/**",
	"**/_evalkit-*/**"
];
async function exists$1(file) {
	try {
		return (await stat(file)).isFile();
	} catch (error) {
		if (error.code === "ENOENT") return false;
		throw error;
	}
}
function evaluation(value, source) {
	if (!value || typeof value !== "object") throw new Error(`${source} must default-export defineEval(...) or an array of evals`);
	const candidate = value;
	authoringId(candidate);
	if (typeof candidate.agent?.start !== "function" || !Array.isArray(candidate.transcript) || !Array.isArray(candidate.scoring)) throw new Error(`Invalid eval exported by ${source}`);
	return candidate;
}
async function discover(root, config) {
	const directory = resolve(root, config.testDir ?? "evals");
	const includes = (config.include ?? defaultInclude).map((pattern) => new Bun.Glob(pattern));
	const excludes = [...defaultExclude, ...config.exclude ?? []].map((pattern) => new Bun.Glob(pattern));
	const paths = [];
	async function walk(dir) {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const file = resolve(dir, entry.name);
			const rel = relative(directory, file).split(sep).join("/");
			if (entry.isSymbolicLink() || entry.name === "node_modules" || entry.name === ".git" || entry.name.startsWith("_evalkit-")) continue;
			if (excludes.some((glob) => glob.match(rel) || entry.isDirectory() && glob.match(`${rel}/`))) continue;
			if (entry.isDirectory()) await walk(file);
			else if (entry.isFile() && includes.some((glob) => glob.match(rel))) paths.push(file);
		}
	}
	try {
		await walk(directory);
	} catch (error) {
		if (error.code === "ENOENT") throw new Error(`Eval directory not found: ${directory}`);
		throw error;
	}
	const evals = [];
	for (const file of paths.sort()) {
		const module = await import(pathToFileURL(file).href);
		for (const value of Array.isArray(module.default) ? module.default : [module.default]) evals.push(evaluation(value, file));
	}
	if (!evals.length) throw new Error(`No eval files found in ${directory}`);
	return evals;
}
async function loadProject(cwd, configPath) {
	const candidates = configPath ? [resolve(cwd, configPath)] : [
		"evalkit.config.ts",
		"evalkit.config.js",
		"evalkit.config.mjs"
	].map((name) => resolve(cwd, name));
	const present = [];
	for (const file of candidates) if (await exists$1(file)) present.push(file);
	if (configPath && !present.length) throw new Error(`Config not found: ${configPath}`);
	if (present.length > 1) throw new Error("Multiple EvalKit configs found; select one with --config");
	const file = present[0];
	const root = file ? dirname(file) : resolve(cwd);
	const config = file ? (await import(pathToFileURL(file).href)).default : {};
	if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("Config must default-export defineConfig({...})");
	for (const [key, value] of Object.entries(config.execution ?? {})) if (value !== void 0 && (!Number.isSafeInteger(value) || value < 1)) throw new Error(`execution.${key} must be a positive integer`);
	let registry = config.registry;
	if (!file && !configPath && await exists$1(resolve(root, "src/registry.ts"))) registry = (await import(pathToFileURL(resolve(root, "src/registry.ts")).href)).default;
	if (!registry) registry = registerEvals(config.evals ?? await discover(root, config));
	if (!registry?.evals || !registry.get) throw new Error("Invalid explicit eval registry");
	const ids = /* @__PURE__ */ new Set();
	for (const e of registry.evals) {
		const id = authoringId(e);
		if (ids.has(id)) throw new Error(`Duplicate eval ID: ${id}`);
		ids.add(id);
	}
	if (config.matrix) {
		const matrix = defineEvalMatrix({
			...config.matrix,
			id: config.matrix.id ?? "default",
			evals: registry.evals
		});
		if (registry.matrices.some((m) => authoringId(m) === authoringId(matrix))) throw new Error(`Duplicate matrix ID: ${authoringId(matrix)}`);
		registry = {
			...registry,
			matrices: [...registry.matrices, matrix]
		};
	}
	return {
		root,
		config,
		registry
	};
}
//#endregion
//#region ../cli/src/run-command.ts
function parseRunArgs(args) {
	const { values, positionals } = parseArgs({
		args,
		allowPositionals: true,
		strict: true,
		options: {
			config: { type: "string" },
			eval: {
				type: "string",
				multiple: true
			},
			model: {
				type: "string",
				multiple: true
			},
			mode: {
				type: "string",
				multiple: true
			},
			select: {
				type: "string",
				multiple: true
			},
			param: {
				type: "string",
				multiple: true
			},
			"max-tokens": { type: "string" },
			"chat-timeout-ms": { type: "string" },
			"turn-budget": { type: "string" },
			concurrency: { type: "string" },
			trials: { type: "string" },
			json: { type: "boolean" },
			"dry-run": { type: "boolean" },
			all: { type: "boolean" },
			local: { type: "boolean" }
		}
	});
	return normalizeRunOptions(values, positionals);
}
/** Domain validation shared by the Effect CLI and programmatic argument parsing. */
function normalizeRunOptions(values, positionals) {
	const parameters = {};
	function integer(name) {
		const value = values[name];
		if (value === void 0) return void 0;
		const number = Number(value);
		if (!Number.isSafeInteger(number) || number < 1) throw new Error(`--${name} must be a positive integer`);
		return number;
	}
	for (const [flag, key] of [
		["max-tokens", "maxTokens"],
		["chat-timeout-ms", "chatTimeoutMs"],
		["turn-budget", "turnBudget"]
	]) {
		const value = integer(flag);
		if (value !== void 0) parameters[key] = value;
	}
	const selection = {};
	for (const key of ["model", "mode"]) if (values[key]?.length) selection[key] = values[key].flatMap((value) => value.split(","));
	for (const value of values.select ?? []) {
		const index = value.indexOf("=");
		if (index < 1) throw new Error("--select requires axis=value");
		const axis = value.slice(0, index);
		let choice;
		try {
			choice = JSON.parse(value.slice(index + 1));
		} catch {
			choice = value.slice(index + 1);
		}
		(selection[axis] ??= []).push(choice);
	}
	for (const value of values.param ?? []) {
		const index = value.indexOf("=");
		if (index < 1) throw new Error("--param requires name=JSON");
		parameters[value.slice(0, index)] = JSON.parse(value.slice(index + 1));
	}
	return {
		values,
		positionals,
		parameters,
		selection,
		concurrency: integer("concurrency"),
		trials: integer("trials")
	};
}
async function runProjectCommand(command, args, cwd = process.cwd(), parsed = parseRunArgs(args)) {
	const { values, positionals, parameters } = parsed;
	const project = await loadProject(cwd, values.config);
	process.chdir(project.root);
	const registry = project.registry;
	const requestedEvals = values.eval?.flatMap((value) => value.split(",")) ?? [];
	let matrix;
	let suiteId;
	if (command === "run-matrix") {
		if (positionals.length !== 1) throw new Error("run-matrix requires one matrix ID");
		matrix = registry.matrices.find((m) => m.id === positionals[0]);
		if (!matrix) throw new Error(`Unknown matrix: ${positionals[0]}`);
	} else if (command === "run-suite") {
		if (positionals.length !== 1) throw new Error("run-suite requires one suite ID");
		const suite = registry.suites.find((s) => s.id === positionals[0]);
		if (!suite) throw new Error(`Unknown suite: ${positionals[0]}`);
		suiteId = authoringId(suite);
		matrix = defineEvalMatrix({
			id: "default",
			evals: suite.evals,
			parameters: project.config.matrix?.parameters ?? {},
			defaults: project.config.matrix?.defaults
		});
	} else {
		requestedEvals.push(...positionals.flatMap((value) => value.split(",")));
		matrix = project.config.matrix ? registry.matrices.at(-1) : defineEvalMatrix({
			id: "default",
			evals: registry.evals,
			parameters: {}
		});
	}
	const selection = {
		parameters: {},
		overrides: { ...parameters },
		...requestedEvals.length ? { evals: requestedEvals } : {}
	};
	for (const [axis, choices] of Object.entries(parsed.selection)) if (axis in matrix.parameters) selection.parameters[axis] = choices;
	else if ((axis === "model" || axis === "mode") && choices.length === 1 && !project.config.matrix && command !== "run-matrix") selection.overrides[axis] = choices[0];
	else throw new Error(`Unknown matrix axis: ${axis}`);
	const cells = matrix.count(selection);
	if (!cells) throw new Error("Selection contains no cells");
	const trials = parsed.trials ?? project.config.execution?.trials;
	const plan = {
		matrix: authoringId(matrix),
		evals: requestedEvals,
		cells,
		parameters: selection.parameters,
		overrides: selection.overrides,
		trials: trials ?? "eval policy"
	};
	if (values["dry-run"]) {
		console.log(JSON.stringify(plan, null, 2));
		return;
	}
	if (cells > (project.config.execution?.maxCells ?? 100) && !values.all) throw new Error(`Selected ${cells} cells. Narrow the selection, inspect --dry-run, or pass --all.`);
	if (!values.json) console.log(`Running ${cells} cell(s) from ${plan.matrix}`);
	if ((await Effect.runPromise(runMatrix(matrix, {
		selection,
		concurrency: parsed.concurrency ?? project.config.execution?.concurrency ?? 4,
		trials,
		...suiteId ? { suiteId } : {},
		...values.local ? { runtime: "local" } : {},
		report: localReportStore(resolve(project.root, project.config.reportDir ?? "_evalkit-results")),
		workspaceRoot: resolve(project.root, project.config.sandboxDir ?? "_evalkit-sandbox"),
		onResult: (cell, result) => {
			if (values.json) console.log(JSON.stringify({
				cell: {
					key: cell.key,
					eval: authoringId(cell.eval),
					parameters: cell.parameters
				},
				result
			}));
			else {
				const passed = result.status === "completed" && (result.aggregateScoring?.passRate === 1 || result.scoring?.passed);
				console.log(`${passed ? "PASS" : "FAIL"} ${cell.eval.name ?? authoringId(cell.eval)} ${JSON.stringify(cell.parameters)}\n  report: ${result.reportLocation}`);
				for (const trial of result.trials ?? [result]) {
					for (const checkpoint of trial.scoring?.checkpoints ?? []) console.log(`  step ${checkpoint.step} ${checkpoint.kind} ${checkpoint.name}: ${checkpoint.status}${checkpoint.value === void 0 ? "" : ` (${checkpoint.value})`}`);
					for (const score of trial.scoring?.results ?? []) console.log(`  ${score.kind} ${score.name}: ${score.value ?? "error"} ${score.explanation ?? ""}`);
				}
			}
		}
	}))).failed) process.exitCode = 1;
}
//#endregion
//#region ../cli/src/new-project.ts
const gitDependency = "git+https://github.com/leostera/evalkit.git";
const ignored = [
	"node_modules/",
	"_evalkit-results/",
	"_evalkit-sandbox/"
];
/** The starter's matrix, fixture, agent and scorer all run without credentials. */
const template = {
	"tsconfig.json": `${JSON.stringify({
		compilerOptions: {
			target: "ES2022",
			module: "ESNext",
			moduleResolution: "Bundler",
			strict: true,
			noEmit: true,
			types: ["bun"]
		},
		include: [
			"agents/**/*.ts",
			"evals/**/*.ts",
			"judges/**/*.ts",
			"evalkit.config.ts"
		]
	}, null, 2)}\n`,
	"evalkit.config.ts": `import { defineConfig } from '@leostera/evalkit';

export default defineConfig({
  // Default-exported evals in evals/*.eval.ts are discovered automatically.
  matrix: {
    id: 'styles',
    parameters: { style: ['plain', 'shout'] },
  },
  execution: { concurrency: 2, maxCells: 20 },
});
`,
	"fixtures/greeting.txt": "Hello\n",
	"agents/greeting-agent.ts": `import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineAgent } from '@leostera/evalkit';

// Replace this in-process example with an adapter for your own agent.
export const greetingAgent = defineAgent({
  identity: { id: 'greeting-agent', kind: 'in-process' },
  runtimes: { local: { kind: 'in-process' } },
  async start({ context, onEvent }) {
    return {
      async send(message: string) {
        // Fixtures copied to the candidate workspace are visible to the AUT.
        const prefix = (await readFile(join(context.workspace.root, 'greeting.txt'), 'utf8')).trim();
        const style = context.parameters?.style;
        if (style !== 'plain' && style !== 'shout')
          throw new Error(\`Unknown style: \${String(style)}\`);
        const greeting = \`\${prefix}, \${message}!\`;
        await onEvent({
          kind: 'message', role: 'assistant',
          content: style === 'shout' ? greeting.toUpperCase() : greeting,
          timestamp: new Date().toISOString(),
        });
      },
      async close() {},
    };
  },
});
`,
	"judges/matches-greeting.ts": `import { predicate } from '@leostera/evalkit';

// Deterministic scorers need no judge model; add a separate judge agent for judge(...) rules.
export const matchesGreeting = predicate('matches greeting and style', ({ context, trajectory }) => {
  const reply = trajectory.events.filter(
    (event) => event.source === 'aut' && event.kind === 'message' && event.role === 'assistant',
  ).at(-1);
  const expected = context.parameters?.style === 'shout' ? 'HELLO, ADA!' : 'Hello, Ada!';
  return {
    value: reply?.kind === 'message' && reply.content === expected ? 1 : 0,
    explanation: \`Expected \${expected}\`,
  };
});
`,
	"evals/greeting.eval.ts": `import { defineEval, file, user } from '@leostera/evalkit';
import { greetingAgent } from '../agents/greeting-agent.js';
import { matchesGreeting } from '../judges/matches-greeting.js';

export default defineEval({
  id: 'greeting',
  agent: greetingAgent,
  fixtures: [file('fixtures/greeting.txt', { dst: 'greeting.txt', visibility: 'candidate' })],
  transcript: [user('Ada')],
  scoring: [matchesGreeting],
});
`
};
const readIfExists = async (path) => {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if (error.code === "ENOENT") return void 0;
		throw error;
	}
};
const exists = async (path) => {
	try {
		await stat(path);
		return true;
	} catch (error) {
		if (error.code === "ENOENT") return false;
		throw error;
	}
};
/** Create a standalone project, or initialize an existing project in place with `new .`. */
async function newProject(args, cwd = process.cwd()) {
	const inPlace = args.length === 1 && (args[0] === "." || args[0] === "./");
	const match = args.length === 1 ? /^(?:\.\/)?([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/.exec(args[0]) : null;
	if (!inPlace && !match) throw new Error("Usage: evalkit new <lowercase-kebab-case-directory|.>");
	const root = inPlace ? resolve(cwd) : resolve(cwd, match[1]);
	const name = inPlace ? basename(root).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "evalkit-evals" : match[1];
	const packagePath = resolve(root, "package.json");
	if (inPlace) {
		if (!(await stat(root)).isDirectory()) throw new Error(`Not a directory: ${root}`);
		for (const path of Object.keys(template).filter((path) => path !== "tsconfig.json")) if (await exists(resolve(root, path))) throw new Error(`Scaffold file already exists: ${resolve(root, path)}`);
		for (const extension of ["js", "mjs"]) if (await exists(resolve(root, `evalkit.config.${extension}`))) throw new Error(`EvalKit config already exists: evalkit.config.${extension}`);
		for (const directory of [
			"agents",
			"fixtures",
			"evals",
			"judges"
		]) {
			const path = resolve(root, directory);
			if (await exists(path) && !(await stat(path)).isDirectory()) throw new Error(`Scaffold directory is not a directory: ${path}`);
		}
	} else try {
		await mkdir(root);
	} catch (error) {
		if (error.code === "EEXIST") throw new Error(`Directory already exists: ${root}`);
		throw error;
	}
	const originalPackage = await readIfExists(packagePath);
	const pkg = originalPackage ? JSON.parse(originalPackage) : {
		name,
		private: true,
		type: "module"
	};
	if (!pkg || Array.isArray(pkg) || typeof pkg !== "object") throw new Error(`Invalid package.json: ${packagePath}`);
	const scripts = pkg.scripts ?? {};
	const dependencies = pkg.dependencies ?? {};
	const devDependencies = pkg.devDependencies ?? {};
	if (!scripts || typeof scripts !== "object" || Array.isArray(scripts) || !dependencies || typeof dependencies !== "object" || Array.isArray(dependencies) || !devDependencies || typeof devDependencies !== "object" || Array.isArray(devDependencies)) throw new Error(`Invalid package.json scripts/dependencies: ${packagePath}`);
	scripts.check ??= "tsc --noEmit";
	scripts.evals ??= "evalkit run-evals greeting --local";
	scripts.matrix ??= "evalkit run-matrix styles --local";
	scripts["matrix:plan"] ??= "evalkit run-matrix styles --dry-run";
	scripts.dashboard ??= "evalkit serve-dashboard";
	if (!dependencies["@leostera/evalkit"] && !devDependencies["@leostera/evalkit"]) dependencies["@leostera/evalkit"] = gitDependency;
	if (!dependencies.typescript && !devDependencies.typescript) devDependencies.typescript = "^6.0.0";
	if (!dependencies["@types/bun"] && !devDependencies["@types/bun"]) devDependencies["@types/bun"] = "^1.4.0";
	pkg.scripts = scripts;
	pkg.dependencies = dependencies;
	pkg.devDependencies = devDependencies;
	for (const [path, contents] of Object.entries(template)) {
		const target = resolve(root, path);
		if (inPlace && path === "tsconfig.json" && await exists(target)) continue;
		await mkdir(resolve(target, ".."), { recursive: true });
		await writeFile(target, contents, { flag: "wx" });
	}
	const ignorePath = resolve(root, ".gitignore");
	const existingIgnore = await readIfExists(ignorePath) ?? "";
	const missing = ignored.filter((entry) => !existingIgnore.split(/\r?\n/).includes(entry));
	if (missing.length) await writeFile(ignorePath, `${existingIgnore}${existingIgnore && !existingIgnore.endsWith("\n") ? "\n" : ""}${missing.join("\n")}\n`);
	const readmePath = resolve(root, "README.md");
	if (!inPlace && !await exists(readmePath)) await writeFile(readmePath, `# ${name}\n\nA local EvalKit project. Each default-exported eval in \`evals/\` is discovered automatically. Start with \`evals/greeting.eval.ts\`: it imports an in-process agent from \`agents/\`, a deterministic scorer from \`judges/\`, and a candidate-visible file from \`fixtures/\`. Replace these examples with your own agent, tasks, and checks.\n\n\`evalkit.config.ts\` defines a provider-free \`styles\` matrix; the example agent reads \`context.parameters.style\`. Run:\n\n\`\`\`sh\nbun install\nbun run check        # type-check your eval, agent, scorer, and config\nbun run evals        # run the example across both styles\nbun run matrix:plan  # inspect the matrix without running it\nbun run matrix       # run the configured matrix\nbun run dashboard    # inspect local reports\n\`\`\`\n\nEvalKit installs from the public GitHub repository; no registry token is needed. Reports and trial workspaces stay local and are ignored by Git. Commit \`bun.lock\` to pin the resolved EvalKit Git revision.\n`);
	await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
	return root;
}
//#endregion
//#region ../cli/src/index.ts
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
process.env.NO_COLOR === void 0 && (process.env.FORCE_COLOR === "1" || process.stdout.isTTY);
function assertUuid(value, label) {
	if (!UUID_PATTERN.test(value)) throw new Error(`Invalid ${label}`);
}
let projectRoot = process.cwd();
let reportRoot = resolve(projectRoot, "_evalkit-results");
const sandboxRoot = resolve(projectRoot, "_evalkit-sandbox");
let project;
function dashboardRunStatus(summary) {
	if (summary.status === "running") return "running";
	if (summary.status !== "completed") return "errored";
	return summary.failed === 0 && summary.passed === summary.trialCount ? "passed" : "failed";
}
function dashboardTrialStatus(summary) {
	if (summary.status === "running") return "running";
	if (summary.status !== "completed") return "errored";
	return summary.scoring?.passed === true ? "passed" : "failed";
}
async function loadRegistry() {
	project ??= await loadProject(projectRoot);
	return project.registry;
}
function runtimeFor(evaluation) {
	for (const runtime of [
		"local",
		"remote",
		"sandbox"
	]) if (evaluation.agent.runtimes?.[runtime]) return runtime;
}
async function runEvals(options) {
	const registry = await loadRegistry();
	const evaluations = options.evalIds.map((id) => registry.get(id));
	if (evaluations.some((e) => !e)) throw new Error("Unknown eval");
	await Effect.runPromise(Effect.all(evaluations.map((evaluation) => runEval(evaluation, {
		report: localReportStore(reportRoot),
		workspaceRoot: sandboxRoot,
		suiteId: options.suiteId,
		runtime: runtimeFor(evaluation),
		concurrency: options.concurrency
	})), { concurrency: options.concurrency }));
}
async function listLocalRuns() {
	let entries;
	try {
		entries = await readdir(reportRoot);
	} catch (error) {
		if (error.code === "ENOENT") return [];
		throw error;
	}
	return (await Promise.all(entries.map(async (id) => {
		const directory = resolve(reportRoot, id);
		try {
			const manifest = await readRunManifest(reportRoot, id);
			const summary = await readRunSummary(reportRoot, id).catch((error) => {
				if (error.code === "ENOENT") return void 0;
				throw error;
			});
			const trialIds = await readdir(`${directory}/trials`).catch((error) => {
				if (error.code === "ENOENT") return [];
				throw error;
			});
			const trials = await Promise.all(trialIds.map((trialId) => readTrialSummary(reportRoot, id, trialId).catch((error) => {
				if (error.code === "ENOENT") return void 0;
				throw error;
			})));
			const scores = trials.flatMap((trial) => trial?.scoring?.overall === void 0 ? [] : [trial.scoring.overall]);
			return {
				id,
				evalId: manifest.evalId,
				...manifest.suiteId ? { suiteId: manifest.suiteId } : {},
				...manifest.matrix ? { matrixId: manifest.matrix.id } : {},
				...manifest.parameters ? { parameters: manifest.parameters } : {},
				...manifest.aut ? { agent: [
					manifest.aut.kind,
					manifest.aut.id,
					manifest.aut.version
				].filter(Boolean).join(" / ") } : {},
				status: summary ? dashboardRunStatus(summary) : "running",
				startedAt: manifest.startedAt,
				...summary?.endedAt ? { completedAt: summary.endedAt } : {},
				...summary?.durationMs !== void 0 ? { durationMs: summary.durationMs } : {},
				completedTrials: summary?.trialCount ?? trials.filter(Boolean).length,
				requestedTrials: summary?.trialCount ?? project?.registry.get(manifest.evalId)?.policy?.trials ?? 1,
				...scores.length ? { score: scores.reduce((sum, score) => sum + score, 0) / scores.length } : {}
			};
		} catch {
			return;
		}
	}))).filter((run) => run !== void 0);
}
async function listLocalTrials(runId) {
	assertUuid(runId, "run ID");
	const trialsRoot = resolve(reportRoot, runId, "trials");
	let trialIds;
	try {
		trialIds = await readdir(trialsRoot);
	} catch (error) {
		if (error.code === "ENOENT") return [];
		throw error;
	}
	return (await Promise.all(trialIds.map(async (id) => {
		const manifest = await readTrialManifest(reportRoot, runId, id);
		const summary = await readTrialSummary(reportRoot, runId, id).catch((error) => {
			if (error.code === "ENOENT") return void 0;
			throw error;
		});
		return {
			id,
			index: manifest.trialIndex,
			status: summary ? dashboardTrialStatus(summary) : "running",
			startedAt: manifest.startedAt,
			...summary?.endedAt ? { completedAt: summary.endedAt } : {},
			...summary?.durationMs !== void 0 ? { durationMs: summary.durationMs } : {},
			...summary?.scoring?.overall === void 0 ? {} : { score: summary.scoring.overall },
			scores: summary?.scoring?.results ?? [],
			checkpoints: summary?.scoring?.checkpoints ?? [],
			...summary?.scoring?.skippedScorers ? { skippedScorers: summary.scoring.skippedScorers } : {}
		};
	}))).sort((left, right) => left.index - right.index);
}
async function readTrialDetail(runId, trialId) {
	assertUuid(runId, "run ID");
	assertUuid(trialId, "trial ID");
	return {
		manifest: await readTrialManifest(reportRoot, runId, trialId),
		summary: await readTrialSummary(reportRoot, runId, trialId).catch((error) => {
			if (error.code === "ENOENT") return { status: "running" };
			throw error;
		})
	};
}
async function listTrialArtifacts(runId, trialId) {
	assertUuid(runId, "run ID");
	assertUuid(trialId, "trial ID");
	const root = resolve(reportRoot, runId, "trials", trialId, "artifacts");
	const result = [];
	async function visit(directory, prefix) {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				result.push({
					path: relative,
					kind: "directory"
				});
				await visit(resolve(directory, entry.name), relative);
			} else {
				const file = Bun.file(resolve(directory, entry.name));
				result.push({
					path: relative,
					kind: "file",
					size: file.size
				});
			}
		}
	}
	try {
		await visit(root, "");
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	return result;
}
async function listCandidateWorkspace(runId, trialId) {
	assertUuid(runId, "run ID");
	assertUuid(trialId, "trial ID");
	const root = resolve(reportRoot, runId, "trials", trialId, "artifacts", "candidate");
	const result = [];
	async function visit(directory, prefix) {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				result.push({
					path: relative,
					kind: "directory"
				});
				await visit(resolve(directory, entry.name), relative);
			} else result.push({
				path: relative,
				kind: "file",
				size: Bun.file(resolve(directory, entry.name)).size
			});
		}
	}
	try {
		await visit(root, "");
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	return result;
}
async function readCandidateWorkspaceFile(runId, trialId, relativePath) {
	assertUuid(runId, "run ID");
	assertUuid(trialId, "trial ID");
	const root = resolve(reportRoot, runId, "trials", trialId, "artifacts", "candidate");
	const file = resolve(root, relativePath);
	if (file !== root && !file.startsWith(`${root}${sep}`)) throw new Error("Invalid workspace path");
	if (!(await stat(file)).isFile()) throw new Error("Workspace path is not a file");
	return new Response(await Bun.file(file).arrayBuffer(), { headers: { "content-type": contentType(file) } });
}
async function readTrajectory(runId, trialId) {
	assertUuid(runId, "run ID");
	assertUuid(trialId, "trial ID");
	return readTrialEvents(reportRoot, runId, trialId).catch((error) => {
		if (error.code === "ENOENT") return [];
		throw error;
	});
}
function contentType(file) {
	return {
		".css": "text/css",
		".html": "text/html",
		".js": "text/javascript"
	}[extname(file)] ?? "application/octet-stream";
}
async function serveDashboard() {
	const registry = await loadRegistry();
	const bundledDashboard = new URL("./dashboard/", import.meta.url);
	const dashboardRoot = fileURLToPath(existsSync(bundledDashboard) ? bundledDashboard : new URL("../../dashboard/dist/", import.meta.url));
	const app = new Hono();
	const dashboardMatrix = project?.config.matrix ? registry.matrices.at(-1) : void 0;
	let matrixRunning = false;
	app.get("/v1/matrix", (context) => context.json({ matrix: dashboardMatrix ? {
		id: dashboardMatrix.id,
		parameters: dashboardMatrix.parameters,
		...project?.config.execution?.trials ? { trials: project.config.execution.trials } : {}
	} : null }));
	app.post("/v1/runs", async (context) => {
		const body = await context.req.json().catch(() => null);
		if (!body || typeof body.path !== "string") return context.text("path is required", 400);
		const [suiteId, evalId] = body.path.includes("#") ? body.path.split("#", 2) : [void 0, body.path];
		const evaluation = registry.get(evalId);
		const registeredSuite = suiteId ? registry.getSuite(suiteId) : void 0;
		if (!evaluation || suiteId && !registeredSuite?.evals.includes(evaluation)) return context.text("Unknown eval", 404);
		if (dashboardMatrix) {
			let selection;
			try {
				selection = selectDashboardCell(dashboardMatrix, authoringId(evaluation), body.parameters);
			} catch (error) {
				return context.text(error instanceof Error ? error.message : "Invalid selection", 400);
			}
			if (matrixRunning) return context.text("A dashboard matrix cell is already running", 409);
			matrixRunning = true;
			Effect.runPromise(runMatrix(dashboardMatrix, {
				selection,
				concurrency: 1,
				trials: project?.config.execution?.trials,
				...suiteId ? { suiteId } : {},
				report: localReportStore(reportRoot),
				workspaceRoot: sandboxRoot
			})).catch((error) => console.error("Dashboard matrix run failed:", error)).finally(() => {
				matrixRunning = false;
			});
		} else {
			if (body.parameters !== void 0) return context.text("Project has no matrix", 400);
			runEvals({
				evalIds: [authoringId(evaluation)],
				suiteId,
				concurrency: 32
			}).catch((error) => console.error("Dashboard run failed:", error));
		}
		return context.json({ accepted: true }, 202);
	});
	app.post("/v1/suites/:suiteId/runs", async (context) => {
		if (dashboardMatrix) return context.text("Select a single eval and matrix cell", 400);
		const suite = registry.getSuite(context.req.param("suiteId"));
		if (!suite) return context.text("Unknown suite", 404);
		runEvals({
			evalIds: suite.evals.map(authoringId),
			suiteId: authoringId(suite),
			concurrency: 32
		}).catch((error) => console.error("Dashboard suite run failed:", error));
		return context.json({ accepted: true }, 202);
	});
	app.get("/v1/catalog", (context) => context.json({ evals: registry.catalog() }));
	app.get("/v1/evals", (context) => context.json({ evals: registry.metadata() }));
	app.get("/v1/suites", (context) => context.json({ suites: registry.suiteMetadata() }));
	app.get("/v1/runs", async (context) => context.json({ runs: await listLocalRuns() }));
	app.get("/v1/runs/:runId/trials", async (context) => {
		try {
			return context.json({ trials: await listLocalTrials(context.req.param("runId")) });
		} catch (error) {
			return context.text(error instanceof Error ? error.message : "Bad request", 400);
		}
	});
	app.get("/v1/runs/:runId/trials/:trialId", async (context) => {
		try {
			return context.json(await readTrialDetail(context.req.param("runId"), context.req.param("trialId")));
		} catch (error) {
			return context.text(error instanceof Error ? error.message : "Not found", 404);
		}
	});
	app.get("/v1/runs/:runId/trials/:trialId/workspace", async (context) => {
		try {
			return context.json(await listCandidateWorkspace(context.req.param("runId"), context.req.param("trialId")));
		} catch (error) {
			return context.text(error instanceof Error ? error.message : "Unable to list workspace", 400);
		}
	});
	app.get("/v1/runs/:runId/trials/:trialId/workspace/*", async (context) => {
		try {
			return await readCandidateWorkspaceFile(context.req.param("runId"), context.req.param("trialId"), context.req.param("*") ?? "");
		} catch (error) {
			return context.text(error instanceof Error ? error.message : "Unable to read workspace file", 400);
		}
	});
	app.get("/v1/runs/:runId/trials/:trialId/artifacts", async (context) => {
		try {
			return context.json({ artifacts: await listTrialArtifacts(context.req.param("runId"), context.req.param("trialId")) });
		} catch (error) {
			return context.text(error instanceof Error ? error.message : "Not found", 404);
		}
	});
	app.get("/v1/runs/:runId/trials/:trialId/events", async (context) => {
		try {
			return context.json({ events: await readTrajectory(context.req.param("runId"), context.req.param("trialId")) });
		} catch (error) {
			return context.text(error instanceof Error ? error.message : "Not found", 404);
		}
	});
	app.all("*", async (context) => {
		const url = new URL(context.req.url);
		const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
		const file = resolve(dashboardRoot, `.${pathname}`);
		if (!file.startsWith(dashboardRoot)) return context.text("Not found", 404);
		let content = Bun.file(file);
		let servedFile = file;
		if (!await content.exists()) {
			if (extname(pathname)) return context.text("Not found", 404);
			servedFile = resolve(dashboardRoot, "index.html");
			content = Bun.file(servedFile);
		}
		return new Response(content, { headers: { "content-type": contentType(servedFile) } });
	});
	const url = `http://localhost:${Bun.serve({
		port: Number(process.env.PORT ?? 4317),
		fetch: app.fetch
	}).port}`;
	console.log(`EvalKit dashboard: ${url}`);
	if (process.env.EVALKIT_NO_OPEN !== "1") {
		const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
		try {
			Bun.spawn([opener, url], {
				stdout: "ignore",
				stderr: "ignore"
			});
		} catch {}
	}
}
const config = text("config").pipe(optional);
const runOptions = {
	config,
	eval: text("eval").pipe(repeated),
	model: text("model").pipe(repeated),
	mode: text("mode").pipe(repeated),
	select: text("select").pipe(repeated),
	param: text("param").pipe(repeated),
	maxTokens: text("max-tokens").pipe(optional),
	chatTimeout: text("chat-timeout-ms").pipe(optional),
	turnBudget: text("turn-budget").pipe(optional),
	concurrency: text("concurrency").pipe(optional),
	trials: text("trials").pipe(optional),
	json: boolean("json"),
	dryRun: boolean("dry-run"),
	all: boolean("all"),
	local: boolean("local")
};
function runInput(options, positionals) {
	const unexpected = positionals.find((value) => value.startsWith("-"));
	if (unexpected) throw new Error(`Unknown option: ${unexpected}`);
	return normalizeRunOptions({
		config: Option.getOrUndefined(options.config),
		eval: options.eval,
		model: options.model,
		mode: options.mode,
		select: options.select,
		param: options.param,
		"max-tokens": Option.getOrUndefined(options.maxTokens),
		"chat-timeout-ms": Option.getOrUndefined(options.chatTimeout),
		"turn-budget": Option.getOrUndefined(options.turnBudget),
		concurrency: Option.getOrUndefined(options.concurrency),
		trials: Option.getOrUndefined(options.trials),
		json: options.json,
		"dry-run": options.dryRun,
		all: options.all,
		local: options.local
	}, positionals);
}
const execute = (command, input) => Effect.tryPromise({
	try: () => runProjectCommand(command, [], process.cwd(), input),
	catch: (error) => error
});
const evalsCommand = make$1("run-evals", {
	...runOptions,
	evalIds: text$2({ name: "eval-id" }).pipe(repeated$2)
}, ({ evalIds, ...options }) => execute("run-evals", runInput(options, evalIds)));
const matrixCommand = make$1("run-matrix", {
	...runOptions,
	matrixId: text$2({ name: "matrix-id" })
}, ({ matrixId, ...options }) => execute("run-matrix", runInput(options, [matrixId])));
const suiteCommand = make$1("run-suite", {
	...runOptions,
	suiteId: text$2({ name: "suite-id" })
}, ({ suiteId, ...options }) => execute("run-suite", runInput(options, [suiteId])));
const newCommand = make$1("new", { directory: text$2({ name: "directory" }) }, ({ directory }) => Effect.tryPromise({
	try: async () => {
		const root = await newProject([directory]);
		console.log(`Created EvalKit project at ${root}\nRun cd ${root} && bun install && bun run evals.`);
	},
	catch: (error) => error
}));
const dashboardCommand = make$1("serve-dashboard", { config }, ({ config }) => Effect.tryPromise({
	try: async () => {
		project = await loadProject(projectRoot, Option.getOrUndefined(config));
		projectRoot = project.root;
		reportRoot = resolve(projectRoot, project.config.reportDir ?? "_evalkit-results");
		await serveDashboard();
	},
	catch: (error) => error
}));
const cli = run(make$1("evalkit").pipe(withSubcommands([
	newCommand,
	evalsCommand,
	matrixCommand,
	suiteCommand,
	dashboardCommand
])), {
	name: "EvalKit",
	version: "0.0.1"
});
const argv = process.argv.slice();
if (argv[2] === "help") argv.splice(2, 1, "--help");
if (argv.at(-2) === "--" && argv.at(-1) === "--help") argv.splice(-2, 1);
try {
	await Effect.runPromise(cli(argv).pipe(Effect.provide(layer)));
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
//#endregion
export {};

//# sourceMappingURL=cli.mjs.map