import { BigNumber } from './bignumber';
import { BONE, calcInGivenOut, calcOutGivenIn } from './balancerCalcs';
import * as helpers from './helpers';
import sor from 'balancer-sor';
import { bnum } from './helpers';
import { SwapMethods } from '../stores/SwapForm';
import { formatPoolData } from './helpers';
import { Pool, SorSwaps, Swap } from '../stores/Proxy';

export const formatSwapsExactAmountIn = (
    sorSwaps: SorSwaps,
    poolData: Pool[],
    maxPrice: BigNumber,
    minAmountOut: BigNumber
): Swap[] => {
    const swaps: Swap[] = [];
    for (let i = 0; i < sorSwaps.inputAmounts.length; i++) {
        let swapAmount = sorSwaps.inputAmounts[i];
        let swap: Swap = {
            pool: sorSwaps.selectedBalancers[i],
            tokenInParam: swapAmount
                .times(BONE)
                .integerValue(3)
                .toString(),
            tokenOutParam: minAmountOut.toString(),
            maxPrice: maxPrice.toString(),
        };
        swaps.push(swap);
    }
    return swaps;
};

export const formatSwapsExactAmountOut = (
    sorSwaps: SorSwaps,
    poolData: Pool[],
    maxPrice: BigNumber,
    maxAmountIn: BigNumber
): Swap[] => {
    const swaps: Swap[] = [];
    for (let i = 0; i < sorSwaps.inputAmounts.length; i++) {
        let swapAmount = sorSwaps.inputAmounts[i];
        let swap: Swap = {
            pool: sorSwaps.selectedBalancers[i],
            tokenInParam: maxAmountIn.toString(),
            tokenOutParam: swapAmount
                .times(BONE)
                .integerValue(3)
                .toString(),
            maxPrice: maxPrice.toString(),
        };
        swaps.push(swap);
    }
    return swaps;
};

export const findPoolsWithTokens = async (
    tokenIn: string,
    tokenOut: string,
    fromWei: boolean = false
): Promise<Pool[]> => {
    let pools = await sor.getPoolsWithTokens(tokenIn, tokenOut);

    if (pools.pools.length === 0)
        throw Error('There are no pools with selected tokens');

    let poolData: Pool[] = [];
    pools.pools.forEach(p => {
        let tI: any = p.tokens.find(
            t => helpers.toChecksum(t.address) === helpers.toChecksum(tokenIn)
        );
        let tO: any = p.tokens.find(
            t => helpers.toChecksum(t.address) === helpers.toChecksum(tokenOut)
        );
        let obj: Pool = {
            id: helpers.toChecksum(p.id),
            balanceIn: bnum(tI.balance),
            balanceOut: bnum(tO.balance),
            weightIn: bnum(tI.denormWeight).div(bnum(p.totalWeight)),
            weightOut: bnum(tO.denormWeight).div(bnum(p.totalWeight)),
            swapFee: bnum(p.swapFee),
        };

        if (fromWei) {
            obj.balanceIn = obj.balanceIn.times(BONE);
            obj.balanceOut = obj.balanceOut.times(BONE);
            obj.weightIn = obj.weightIn.times(BONE);
            obj.weightOut = obj.weightOut.times(BONE);
            obj.swapFee = obj.swapFee.times(BONE);
        }

        poolData.push(obj);
    });
    return poolData;
};

export const findBestSwaps = (
    balancers: Pool[],
    swapMethod: SwapMethods,
    inputAmount: BigNumber,
    maxBalancers: number,
    costOutputToken: BigNumber
): SorSwaps => {
    return sor.linearizedSolution(
        formatPoolData(balancers),
        swapMethod,
        inputAmount.toString(),
        maxBalancers,
        costOutputToken.toString()
    );
};

/* Go through selected swaps and determine the total output */
export const calcTotalOutput = (swaps: Swap[], poolData: Pool[]): BigNumber => {
    try {
        let totalAmountOut = bnum(0);
        swaps.forEach(swap => {
            const swapAmount = swap.tokenInParam;

            const pool = poolData.find(p => p.id == swap.pool);
            if (!pool) {
                throw new Error(
                    '[Invariant] No pool found for selected balancer index'
                );
            }

            const preview = calcOutGivenIn(
                pool.balanceIn,
                pool.weightIn,
                pool.balanceOut,
                pool.weightOut,
                bnum(swapAmount),
                pool.swapFee
            );

            totalAmountOut = totalAmountOut.plus(preview);
        });
        return totalAmountOut;
    } catch (e) {
        throw new Error(e);
    }
};

/* Go through selected swaps and determine the total input */
export const calcTotalInput = (
    swaps: Swap[],
    poolData: Pool[],
    maxPrice: string,
    maxAmountIn: string
): BigNumber => {
    try {
        let totalAmountIn = bnum(0);
        swaps.forEach(swap => {
            const swapAmount = swap.tokenOutParam;
            const pool = poolData.find(p => p.id == swap.pool);
            if (!pool) {
                throw new Error(
                    '[Invariant] No pool found for selected balancer index'
                );
            }

            const preview = calcInGivenOut(
                pool.balanceIn,
                pool.weightIn,
                pool.balanceOut,
                pool.weightOut,
                bnum(swapAmount),
                pool.swapFee
            );

            totalAmountIn = totalAmountIn.plus(preview);
        });

        return totalAmountIn;
    } catch (e) {
        throw new Error(e);
    }
};
