"use strict";
// Copyright 2020-2022 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = require("lodash");
const BlockedQueue_1 = require("./BlockedQueue");
describe('BlockedQueue', () => {
    it('first in and first out', async () => {
        const queue = new BlockedQueue_1.BlockedQueue(10);
        const sequence = (0, lodash_1.range)(0, 10);
        for (const i of sequence) {
            queue.put(i);
        }
        for (const i of sequence) {
            await expect(queue.take()).resolves.toEqual(i);
        }
    });
    it('throw error when put items more than maxSize', () => {
        const size = 10;
        const queue = new BlockedQueue_1.BlockedQueue(10);
        const sequence = (0, lodash_1.range)(0, 10);
        for (const i of sequence) {
            queue.put(i);
        }
        expect(() => queue.put(0)).toThrow('BlockedQueue exceed max size');
    });
    it('block take() when queue is empty', async () => {
        const queue = new BlockedQueue_1.BlockedQueue(10);
        const delay = 1000;
        const startTs = new Date();
        let msecondTooks;
        const takePromise = queue
            .take()
            .then(() => (msecondTooks = new Date().getTime() - startTs.getTime()));
        setTimeout(() => queue.put(0), delay);
        await takePromise;
        expect(msecondTooks).toBeGreaterThanOrEqual(delay);
    });
    it('block takeAll() with batchsize', async () => {
        const queue = new BlockedQueue_1.BlockedQueue(10);
        const sequence = (0, lodash_1.range)(0, 10);
        for (const i of sequence) {
            queue.put(i);
        }
        //Take first batch
        await expect(queue.takeAll(6)).resolves.toEqual([0, 1, 2, 3, 4, 5]);
        //Take rest of it
        await expect(queue.takeAll(6)).resolves.toEqual([6, 7, 8, 9]);
    });
    it('block takeAll() without max batchsize', async () => {
        const queue = new BlockedQueue_1.BlockedQueue(10);
        const sequence = (0, lodash_1.range)(0, 10);
        for (const i of sequence) {
            queue.put(i);
        }
        await expect(queue.takeAll()).resolves.toEqual([
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
        ]);
    });
    it('block takeAll() when queue is empty', async () => {
        const queue = new BlockedQueue_1.BlockedQueue(10);
        const delay = 1000;
        const startTs = new Date();
        let msecondTooks;
        const takePromise = queue
            .takeAll()
            .then(() => (msecondTooks = new Date().getTime() - startTs.getTime()));
        setTimeout(() => queue.put(0), delay);
        await takePromise;
        expect(msecondTooks).toBeGreaterThanOrEqual(delay);
    });
    it('throw error when putAll items more than maxSize', () => {
        const size = 10;
        const queue = new BlockedQueue_1.BlockedQueue(10);
        const sequence = (0, lodash_1.range)(0, 10);
        queue.putAll(sequence);
        expect(() => queue.putAll([11, 12, 13])).toThrow('BlockedQueue exceed max size');
    });
});
//# sourceMappingURL=BlockedQueue.spec.js.map