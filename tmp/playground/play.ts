import { transferSchema, balanceOfSchema, schemas } from './erc20-schema.js';

const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

function show(label: string, schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: { issues: { message: string }[] } } }, input: unknown) {
  console.log(`\n--- ${label} ---`);
  console.log('input :', input);
  const r = schema.safeParse(input);
  if (r.success) {
    console.log('result:', r.data);
  } else {
    console.log('error :', r.error!.issues[0]?.message);
  }
}

show('valid transfer', transferSchema, [VITALIK, '100']);
show('bad address',    transferSchema, ['not-an-address', '100']);
show('negative uint',  transferSchema, [VITALIK, '-1']);
show('wrong arity',    transferSchema, [VITALIK]);

show('barrel by name',      schemas.balanceOf,            [VITALIK]);
show('barrel by signature', schemas['balanceOf(address)'], [VITALIK]);

// Show parsed types — addresses stay `0x${string}`, uints become bigint
console.log('\n--- types of parsed transfer output ---');
const [to, value] = transferSchema.parse([VITALIK, '100']);
console.log(`to    : ${typeof to} (${to})`);
console.log(`value : ${typeof value} (${value})`);

// silence "unused"
void balanceOfSchema;
