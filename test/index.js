import * as tfc from '../src/index';

tfc.tensor1d([.1]);

console.log(tfc.ENV.features);

// tfc.tensor1d([2, 4, 16, 2.4]).square().print();

const res = tfc.tensor1d([2, 4, 16, 2.4]).square();
document.getElementById('content').innerHTML =
  `tfc.tensor1d([2, 4, 16, 2.4]).square() = ${res}`;
tfc.tensor1d([2, 4, 16, 2.4]).square()
//tfc.tensor1d([.1]).square().print();
