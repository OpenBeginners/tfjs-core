/**
 * @license
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */

import {ENV} from '../environment';
import * as util from '../util';

import {doc, operation} from './decorators';
import {MPRandGauss, RandNormalDataTypes} from './rand';
import {Tensor, Tensor1D, Tensor2D, Tensor3D, TensorBuffer} from './tensor';
import {DataType, DataTypeMap, Rank, ShapeMap} from './types';

export class Ops {
  /** Creates a tensor of ones with the specified shape. */
  @doc({heading: 'Tensors', subheading: 'Creation'})
  @operation
  static ones<R extends Rank>(shape: ShapeMap[R], dtype?: DataType): Tensor<R> {
    const values = makeOnesTypedArray(util.sizeFromShape(shape), dtype);
    return Tensor.make(shape, {values}, dtype);
  }

  /** Creates a tensor of zeros with the specified shape. */
  @doc({heading: 'Tensors', subheading: 'Creation'})
  @operation
  static zeros<R extends Rank>(shape: ShapeMap[R], dtype?: DataType):
      Tensor<R> {
    const values = makeZerosTypedArray(util.sizeFromShape(shape), dtype);
    return Tensor.make(shape, {values}, dtype);
  }

  @operation
  /** Creates a Tensor filled with a value. */
  static fill<R extends Rank>(
      shape: ShapeMap[R], value: number, dtype: DataType = 'float32'):
      Tensor<R> {
    const values =
        util.getTypedArrayFromDType(dtype, util.sizeFromShape(shape));
    values.fill(value);
    return Tensor.make(shape, {values}, dtype);
  }

  /**
   * Creates a tensor of ones with the same shape as the specified tensor.
   */
  @doc({heading: 'Tensors', subheading: 'Creation'})
  @operation
  static onesLike<T extends Tensor>(x: T): T {
    return Ops.ones(x.shape, x.dtype) as T;
  }

  /**
   * Creates a tensor of zeros with the same shape as the specified tensor.
   */
  @doc({heading: 'Tensors', subheading: 'Creation'})
  @operation
  static zerosLike<T extends Tensor>(x: T): T {
    return Ops.zeros(x.shape, x.dtype) as T;
  }

  /** Creates a tensor with the same values/shape as the specified tensor. */
  @doc({heading: 'Tensors', subheading: 'Creation'})
  @operation
  static clone<T extends Tensor>(x: T): T {
    return Tensor.make(x.shape, {dataId: x.dataId}, x.dtype) as T;
  }

  @doc({heading: 'Tensors', subheading: 'Creation'})
  @operation
  static randNormal<R extends Rank>(
      shape: ShapeMap[R], mean = 0, stdDev = 1,
      dtype?: keyof RandNormalDataTypes, seed?: number): Tensor<R> {
    if (dtype != null && (dtype as DataType) === 'bool') {
      throw new Error(`Unsupported data type ${dtype}`);
    }
    const randGauss =
        new MPRandGauss(mean, stdDev, dtype, false /* truncated */, seed);
    return Tensor.rand(shape, () => randGauss.nextValue(), dtype);
  }

  @doc({heading: 'Tensors', subheading: 'Creation'})
  @operation
  static truncatedNormal<R extends Rank>(
      shape: ShapeMap[R], mean = 0, stdDev = 1,
      dtype?: keyof RandNormalDataTypes, seed?: number): Tensor<R> {
    if (dtype != null && (dtype as DataType) === 'bool') {
      throw new Error(`Unsupported data type ${dtype}`);
    }
    const randGauss =
        new MPRandGauss(mean, stdDev, dtype, true /* truncated */, seed);
    return Tensor.rand(shape, () => randGauss.nextValue(), dtype);
  }

  @doc({heading: 'Tensors', subheading: 'Creation'})
  @operation
  static randUniform<R extends Rank>(
      shape: ShapeMap[R], a: number, b: number, dtype?: DataType): Tensor<R> {
    return Tensor.rand(shape, () => util.randUniform(a, b), dtype);
  }

  @doc({heading: 'Tensors', subheading: 'Creation'})
  @operation
  static rand<R extends Rank>(
      shape: ShapeMap[R], randFunction: () => number, dtype?: DataType):
      Tensor<R> {
    const size = util.sizeFromShape(shape);

    let values = null;
    if (dtype == null || dtype === 'float32') {
      values = new Float32Array(size);
    } else if (dtype === 'int32') {
      values = new Int32Array(size);
    } else if (dtype === 'bool') {
      values = new Uint8Array(size);
    } else {
      throw new Error(`Unknown data type ${dtype}`);
    }

    for (let i = 0; i < size; i++) {
      values[i] = randFunction();
    }
    return Tensor.make(shape, {values}, dtype);
  }

  /**
   * Draws samples from a multinomial distribution.
   *
   * @param probabilities 1D array with normalized outcome probabilities, or
   *     2D array of shape `[batchSize, numOutcomes]`.
   * @param numSamples Number of samples to draw for each row slice.
   * @param seed Optional. The seed number.
   * @return 1D array of shape `[numSamples]`, or 2D array of shape
   *     `[batchSize, numSamples]`, depending on the rank of the input.
   */
  @doc({heading: 'Tensors', subheading: 'Creation'})
  @operation
  static multinomial(
      probabilities: Tensor1D|Tensor2D, numSamples: number, seed?: number):
      Tensor1D|Tensor2D {
    const numOutcomes = probabilities.size;
    if (numOutcomes < 2) {
      throw new Error(
          `Error in multinomial: you need at least 2 outcomes, but got ` +
          `${numOutcomes}.`);
    }
    if (probabilities.rank > 2) {
      throw new Error(
          `Rank of probabilities must be 1 or 2, but is ${probabilities.rank}`);
    }
    seed = seed || Math.random();
    const origRank = probabilities.rank;

    if (probabilities.rank === 1) {
      probabilities = probabilities.as2D(1, -1);
    }
    const res = ENV.engine.executeKernel('Multinomial', {
      inputs: {probs: (probabilities as Tensor2D)},
      args: {numSamples, seed}
    });
    if (origRank === 1) {
      return res.as1D();
    }
    return res;
  }

  /**
   * Returns a one-hot array. The locations represented by `indices` take
   * value `onValue` (defaults to 1), while all other locations take value
   * `offValue` (defaults to 0).
   *
   * @param indices 1D Array of indices.
   * @param depth The depth of the one hot dimension.
   * @param onValue A number used to fill in output when the index matches the
   *     location.
   * @param offValue A number used to fill in the output when the index does
   *     not match the location.
   */
  @doc({heading: 'Tensors', subheading: 'Creation'})
  @operation
  static oneHot(indices: Tensor1D, depth: number, onValue = 1, offValue = 0):
      Tensor2D {
    if (depth < 2) {
      throw new Error(`Error in oneHot: depth must be >=2, but it is ${depth}`);
    }
    return ENV.engine.executeKernel(
        'OneHot', {inputs: {indices}, args: {depth, onValue, offValue}});
  }

  @doc({heading: 'Tensors', subheading: 'Creation'})
  @operation
  static fromPixels(
      pixels: ImageData|HTMLImageElement|HTMLCanvasElement|HTMLVideoElement,
      numChannels = 3): Tensor3D {
    if (numChannels > 4) {
      throw new Error(
          'Cannot construct Tensor with more than 4 channels from pixels.');
    }
    return ENV.backend.fromPixels(pixels, numChannels);
  }

  /** Reshapes the array. */
  @doc({heading: 'Tensors', subheading: 'Transformations'})
  @operation
  static reshape<R2 extends Rank>(x: Tensor, newShape: ShapeMap[R2]):
      Tensor<R2> {
    newShape = util.inferFromImplicitShape(newShape, x.size);
    util.assert(
        x.size === util.sizeFromShape(newShape),
        'new shape and old shape must have the same number of elements.');

    const grad = (dy: Tensor<R2>, y: Tensor<R2>) => {
      return {x: () => dy.reshape(x.shape)};
    };
    return ENV.engine.executeKernel(
               'Reshape', {inputs: {x}, args: {newShape}}, grad) as Tensor<R2>;
  }

  /**
   * Casts a tensor to a new type. If the new type matches the old type,
   * this is a no-op.
   */
  @doc({heading: 'Tensors', subheading: 'Transformations'})
  @operation
  static cast<T extends Tensor>(x: T, newDType: DataType): T {
    const grad = (dy: T, y: T) => {
      return {x: () => dy.reshape(dy.shape)};
    };
    return ENV.engine.executeKernel(
               'Cast', {inputs: {x}, args: {newDType}}, grad) as T;
  }

  /**
   * Construct an array by repeating it the number of times given by reps.
   *
   * This operation creates a new array by replicating `input` `reps`
   * times. The output tensor's i'th dimension has `input.shape[i] *
   * reps[i]` elements, and the values of `input` are replicated
   * `reps[i]` times along the i'th dimension. For example, tiling
   * `[a, b, c, d]` by `[2]` produces `[a, b, c, d, a, b, c, d]`.
   *
   * @param x The array to transpose.
   * @param reps Determines the number of replications per dimension.
   */
  @doc({heading: 'Tensors', subheading: 'Slicing and Joining'})
  @operation
  static tile<T extends Tensor>(x: T, reps: number[]): T {
    util.assert(
        x.rank === reps.length,
        `Error in transpose: rank of input ${x.rank} ` +
            `must match length of reps ${reps}.`);
    return ENV.engine.executeKernel('Tile', {inputs: {x}, args: {reps}}) as T;
  }

  /**
   * Gather slices from array `x`'s axis `axis` according to `indices`
   *
   * @param x The array to transpose.
   * @param indices The indices of the values to extract.
   * @param axis Optional. The axis over which to select values. Defaults to 0.
   */
  @doc({heading: 'Tensors', subheading: 'Slicing and Joining'})
  @operation
  static gather<T extends Tensor>(x: T, indices: Tensor1D, axis = 0): T {
    return ENV.engine.executeKernel(
               'Gather', {inputs: {x, indices}, args: {axis}}) as T;
  }

  /**
   * Pads a Tensor1D.
   *
   * This operation will pad an array according to the `paddings` you specify.
   *
   * This operation currently only implements the `CONSTANT` mode from
   * Tensorflow's `pad` operation.
   *
   * @param x The array to pad.
   * @param paddings A tuple of ints [padLeft, padRight], how much to pad on the
   *     left and right side of the array.
   * @param constantValue The scalar pad value to use. Defaults to 0.
   */
  @doc({heading: 'Tensors', subheading: 'Slicing and Joining'})
  @operation
  static pad1D(x: Tensor1D, paddings: [number, number], constantValue = 0):
      Tensor1D {
    util.assert(
        paddings.length === 2,
        'Invalid number of paddings. Must be length of 2.');
    return ENV.engine.executeKernel(
        'Pad1D', {inputs: {x}, args: {paddings, constantValue}});
  }

  /**
   * Pads a Tensor2D.
   *
   * This operation will pad an array according to the `paddings` you specify.
   *
   * This operation currently only implements the `CONSTANT` mode from
   * Tensorflow's `pad` operation.
   *
   * @param x The array to pad.
   * @param paddings A pair of tuple ints
   *     [[padTop, padBottom], [padLeft, padRight]], how much to pad on the
   *     array.
   * @param constantValue The scalar pad value to use. Defaults to 0.
   */
  @doc({heading: 'Tensors', subheading: 'Slicing and Joining'})
  @operation
  static pad2D(
      x: Tensor2D, paddings: [[number, number], [number, number]],
      constantValue = 0): Tensor2D {
    util.assert(
        paddings.length === 2 && paddings[0].length === 2 &&
            paddings[1].length === 2,
        'Invalid number of paddings. Must be length of 2 each.');
    return ENV.engine.executeKernel(
        'Pad2D', {inputs: {x}, args: {paddings, constantValue}});
  }

  /**
   * Creates a new Tensor1D filled with the numbers in the range provided.
   *
   * The array is a is half-open interval meaning it includes start, but
   * excludes stop. Decrementing ranges and negative step values are also
   * supported.
   *
   * @param start An integer start value
   * @param stop An integer stop value
   * @param step An optional integer increment (will default to 1 or -1)
   * @param dtype An optional dtype
   */
  @operation
  static range(
      start: number, stop: number, step = 1,
      dtype: 'float32'|'int32' = 'float32'): Tensor1D {
    if (step === 0) {
      throw new Error('Cannot have a step of zero');
    }

    const sameStartStop = start === stop;
    const increasingRangeNegativeStep = start < stop && step < 0;
    const decreasingRangePositiveStep = stop < start && step > 1;

    if (sameStartStop || increasingRangeNegativeStep ||
        decreasingRangePositiveStep) {
      return Ops.zeros([0], dtype);
    }

    const numElements = Math.abs(Math.ceil((stop - start) / step));
    const values = makeZerosTypedArray(numElements, dtype);

    if (stop < start && step === 1) {
      // Auto adjust the step's sign if it hasn't been set
      // (or was set to 1)
      step = -1;
    }

    values[0] = start;
    for (let i = 1; i < values.length; i++) {
      values[i] = values[i - 1] + step;
    }

    return Tensor1D.new(values, dtype);
  }

  /**
   * Creates an empty `TensorBuffer` with the specified `shape` and `dtype`.
   * The values are stored in cpu as a `TypedArray`. Fill the buffer using
   * `buffer.set()`, or by modifying directly `buffer.values`. When done,
   * call `buffer.toTensor()` to get an immutable `Tensor` with those values.
   */
  static buffer<R extends Rank>(shape: ShapeMap[R], dtype: DataType):
      TensorBuffer<R> {
    return new TensorBuffer<R>(shape, dtype);
  }
}

function makeZerosTypedArray<D extends DataType>(
    size: number, dtype: D): DataTypeMap[D] {
  if (dtype == null || dtype === 'float32') {
    return new Float32Array(size);
  } else if (dtype === 'int32') {
    return new Int32Array(size);
  } else if (dtype === 'bool') {
    return new Uint8Array(size);
  } else {
    throw new Error(`Unknown data type ${dtype}`);
  }
}

function makeOnesTypedArray<D extends DataType>(
    size: number, dtype: D): DataTypeMap[D] {
  const array = makeZerosTypedArray(size, dtype);
  for (let i = 0; i < array.length; i++) {
    array[i] = 1;
  }
  return array;
}