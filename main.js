'use strict';

const {readFile} = require('fs-extra');
const {BufferView} = require('@sage-js/core');
const {OSI} = require('@sage-js/res-osi');

function subroutineFinder(osi, address) {
	let subroutine = null;
	for (const sub of osi.subroutines.itter()) {
		if (!subroutine) {
			subroutine = sub;
		}

		const off = sub.offset.value;
		if (off > subroutine.offset.value && off < address) {
			subroutine = sub;
		}
	}
	return subroutine;
}

function subroutineInstructionFinder(subroutine, offset) {
	const insts = subroutine.instructions;
	let size = 0;
	for (let i = 0; i < insts.length; i++) {
		const inst = insts[i];
		const instS = size;
		const instE = size + inst.size;

		if (offset >= instS && offset < instE) {
			return {
				index: i,
				instruction: inst
			};
			break;
		}
		size = instE;
	}
	return null;
}

async function main() {
	const args = process.argv.slice(2);
	if (args.length < 2) {
		throw new Error('Required arguments: osifile address');
	}
	const [osifile, addressStr] = args;
	const address = +addressStr;
	if (!Number.isInteger(address)) {
		throw new Error(`Address not an integer: ${address}`);
	}

	const buffer = await readFile(osifile);
	const view = new BufferView(buffer, true, 0, -1, true);

	if (address < 0 || address > view.size) {
		throw new Error('Address outside file range');
	}

	const osi = new OSI();
	view.readReadable(osi);

	if (address < osi.subroutines.baseOffset.value) {
		throw new Error('Address before first subroutine');
	}

	osi.transformClassExtendsAdd();

	// Find the subroutine this address is somewhere inside.
	const subroutine = subroutineFinder(osi, address);
	const instructionOffset = address - subroutine.offset.value;

	// Prints out info on the instruction.
	const printInstrucionInfo = info => {
		const out =  [
			`[${info.index}]`,
			info.instruction.name
		];
		const args = [];
		for (let i = 0;  i < info.instruction.argc; i++) {
			args.push(info.instruction.argGet(i).stringEncode());
		}
		if (args.length) {
			out.push(args.join(', '));
		}
		console.log(`  Instruction: ${out.join(' ')}`);
	};

	// Search the functions for that subroutine.
	for (const f of osi.header.functionTable.entries) {
		if (f.offset.value === subroutine.offset.value) {
			console.log(`Function: ${f.name.stringEncode()}`);
			printInstrucionInfo(
				subroutineInstructionFinder(subroutine.subroutine, instructionOffset)
			);
			return;
		}
	}

	// Search class methods for that subroutine.
	for (const {name, structure} of osi.header.classTable.entries) {
		for (const {symbol, offset} of structure.classMethodTable.entries) {
			if (offset.value === subroutine.offset.value) {
				const methodName = osi.header.symbolTable.entries[symbol.value];
				console.log(`Class: ${name.stringEncode()}.${methodName.stringEncode()}`);
				printInstrucionInfo(
					subroutineInstructionFinder(subroutine.subroutine, instructionOffset)
				);
				return;
			}
		}
	}

	throw new Error('Not found');
}
main().catch(err => {
	process.exitCode = 1;
	console.error(err);
});
