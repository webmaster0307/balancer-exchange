import { action, observable } from 'mobx';
import * as helpers from 'utils/helpers';
import {
    bnum,
    printPoolData,
    printSorSwaps,
    printSwapInput,
    printSwaps,
    Scale,
} from 'utils/helpers';
import RootStore from 'stores/Root';
import { BigNumber } from 'utils/bignumber';
import * as log from 'loglevel';
import { ContractTypes } from './Provider';
import { SwapMethods } from './SwapForm';
import CostCalculator from '../utils/CostCalculator';
import {
    calcPrice,
    calcTotalInput,
    calcTotalOutput,
    calcTotalSpotValue,
    findBestSwaps,
    findPoolsWithTokens,
    formatSwapsExactAmountIn,
    formatSwapsExactAmountOut,
} from '../utils/sorWrapper';
import { ethers } from 'ethers';
import { EtherKey } from './Token';

export interface ExactAmountOutPreview {
    outputAmount: BigNumber;
    totalInput: BigNumber | null;
    effectivePrice: BigNumber | null;
    spotPrice: BigNumber | null;
    swaps: Swap[];
    validSwap: boolean;
    error?: string;
}

export interface ExactAmountInPreview {
    inputAmount: BigNumber;
    totalOutput: BigNumber | null;
    effectivePrice: BigNumber | null;
    spotPrice: BigNumber | null;
    swaps: Swap[];
    validSwap: boolean;
    error?: string;
}

export interface SwapInput {
    method: SwapMethods;
    tokenIn: string;
    tokenOut: string;
    inputAmount?: BigNumber;
    outputAmount?: BigNumber;
    minAmountOut?: BigNumber;
    maxAmountIn?: BigNumber;
    maxPrice: BigNumber;
}

export interface Pool {
    id: string;
    balanceIn: BigNumber;
    balanceOut: BigNumber;
    weightIn: BigNumber;
    weightOut: BigNumber;
    swapFee: BigNumber;
}

export interface StringifiedPool {
    id: string;
    balanceIn: string;
    balanceOut: string;
    weightIn: string;
    weightOut: string;
    swapFee: string;
}

export interface SorSwaps {
    inputAmounts: BigNumber[];
    selectedBalancers: string[];
    totalOutput: BigNumber;
}

export type Swap = {
    pool: string;
    tokenInParam: string;
    tokenOutParam: string;
    maxPrice: string;
};

function printDebugInfo(
    input: SwapInput,
    swaps: Swap[],
    sorSwaps: SorSwaps,
    poolData: Pool[],
    result: BigNumber,
    effectivePrice: BigNumber
) {
    console.log('[Swap Preview]');
    printSwapInput(input);
    printPoolData(poolData);
    printSorSwaps(sorSwaps);
    printSwaps(input.method, swaps);
    console.log('[Result]', {
        result: result.toString(),
        effectivePrice: effectivePrice.toString(),
    });
}

export default class ProxyStore {
    @observable previewPending: boolean;
    costCalculator: CostCalculator;
    rootStore: RootStore;

    constructor(rootStore) {
        this.rootStore = rootStore;
        this.previewPending = false;
        this.costCalculator = new CostCalculator({
            gasPrice: bnum(0.00000001),
            gasPerTrade: bnum(210000),
            outTokenEthPrice: bnum(100),
        });
    }

    isPreviewPending() {
        return this.previewPending;
    }

    setPreviewPending(value) {
        this.previewPending = value;
    }

    /*
        Swap Methods - Action
    */
    @action batchSwapExactIn = async (
        swaps: Swap[],
        tokenIn: string,
        inputAmount: BigNumber,
        tokenOut: string,
        minAmountOut: BigNumber,
        maxPrice: BigNumber
    ) => {
        const { tokenStore, providerStore } = this.rootStore;
        const { chainId } = providerStore.getActiveWeb3React();

        console.log('[BatchSwapExactIn]', {
            swaps,
            tokenIn,
            tokenOut,
            tokenAmountIn: inputAmount.toString(),
            minAmountOut: minAmountOut.toString(),
        });

        const proxyAddress = tokenStore.getProxyAddress(chainId);

        if (tokenIn === EtherKey) {
            await providerStore.sendTransaction(
                ContractTypes.ExchangeProxy,
                proxyAddress,
                'batchEthInSwapExactIn',
                [swaps, tokenOut, minAmountOut.toString()],
                { value: ethers.utils.bigNumberify(inputAmount.toString()) }
            );
        } else if (tokenOut === EtherKey) {
            await providerStore.sendTransaction(
                ContractTypes.ExchangeProxy,
                proxyAddress,
                'batchEthOutSwapExactIn',
                [
                    swaps,
                    tokenIn,
                    inputAmount.toString(),
                    minAmountOut.toString(),
                ]
            );
        } else {
            await providerStore.sendTransaction(
                ContractTypes.ExchangeProxy,
                proxyAddress,
                'batchSwapExactIn',
                [
                    swaps,
                    tokenIn,
                    tokenOut,
                    inputAmount.toString(),
                    minAmountOut.toString(),
                ]
            );
        }
    };

    @action batchSwapExactOut = async (
        swaps: Swap[],
        tokenIn: string,
        maxAmountIn: BigNumber,
        tokenOut: string,
        amountOut: BigNumber,
        maxPrice: BigNumber
    ) => {
        const { tokenStore, providerStore } = this.rootStore;
        const { chainId } = providerStore.getActiveWeb3React();

        const proxyAddress = tokenStore.getProxyAddress(chainId);

        if (tokenIn === EtherKey) {
            await providerStore.sendTransaction(
                ContractTypes.ExchangeProxy,
                proxyAddress,
                'batchEthInSwapExactOut',
                [swaps, tokenOut, amountOut.toString()],
                { value: ethers.utils.bigNumberify(maxAmountIn.toString()) }
            );
        } else if (tokenOut === EtherKey) {
            await providerStore.sendTransaction(
                ContractTypes.ExchangeProxy,
                proxyAddress,
                'batchEthOutSwapExactOut',
                [swaps, tokenIn, amountOut.toString(), maxAmountIn.toString()]
            );
        } else {
            await providerStore.sendTransaction(
                ContractTypes.ExchangeProxy,
                proxyAddress,
                'batchSwapExactOut',
                [
                    swaps,
                    tokenIn,
                    tokenOut,
                    amountOut.toString(),
                    maxAmountIn.toString(),
                ]
            );
        }
    };

    calcEffectivePrice(amountIn: BigNumber, amountOut: BigNumber): BigNumber {
        return amountIn.div(amountOut);
    }

    /*
        Swap Methods - Preview
    */
    previewBatchSwapExactIn = async (
        tokenIn: string,
        tokenOut: string,
        inputAmount: BigNumber
    ): Promise<ExactAmountInPreview> => {
        try {
            this.setPreviewPending(true);
            const { tokenStore, providerStore } = this.rootStore;
            const { chainId } = providerStore.getActiveWeb3React();

            let maxPrice = helpers.setPropertyToMaxUintIfEmpty();
            let minAmountOut = helpers.setPropertyToZeroIfEmpty();

            // Use WETH address for Ether
            const tokenInToFind =
                tokenIn === EtherKey
                    ? tokenStore.getWethAddress(chainId)
                    : tokenIn;
            const tokenOutToFind =
                tokenOut === EtherKey
                    ? tokenStore.getWethAddress(chainId)
                    : tokenOut;

            const poolData = await findPoolsWithTokens(
                tokenInToFind,
                tokenOutToFind,
                true
            );
            const costOutputToken = this.costCalculator.getCostOutputToken();

            const sorSwaps = findBestSwaps(
                poolData,
                SwapMethods.EXACT_IN,
                inputAmount,
                20,
                costOutputToken
            );

            const swaps = formatSwapsExactAmountIn(
                sorSwaps,
                poolData,
                bnum(maxPrice),
                bnum(minAmountOut)
            );

            const totalOutputSpot = calcTotalSpotValue(
                SwapMethods.EXACT_IN,
                swaps,
                poolData
            );

            console.log('[Spot Price Calc]', {
                inputAmount: inputAmount.toString(),
                totalOutputSpot: totalOutputSpot.toString(),
            });

            const spotPrice = calcPrice(inputAmount, totalOutputSpot);

            const totalOutput = calcTotalOutput(swaps, poolData);

            const effectivePrice = this.calcEffectivePrice(
                inputAmount,
                helpers.scale(totalOutput, Scale.fromWei)
            );

            printDebugInfo(
                {
                    method: SwapMethods.EXACT_IN,
                    tokenIn,
                    tokenOut,
                    inputAmount,
                    maxPrice: bnum(0),
                },
                swaps,
                sorSwaps,
                poolData,
                totalOutput,
                effectivePrice
            );

            this.setPreviewPending(false);
            return {
                inputAmount,
                totalOutput,
                effectivePrice,
                spotPrice,
                swaps,
                validSwap: true,
            };
        } catch (e) {
            log.error('[Error] previewSwapExactAmountIn', e);
            this.setPreviewPending(false);
            return {
                inputAmount,
                totalOutput: null,
                effectivePrice: null,
                spotPrice: null,
                swaps: null,
                validSwap: false,
                error: e.message,
            };
        }
    };

    previewBatchSwapExactOut = async (
        tokenIn: string,
        tokenOut: string,
        outputAmount: BigNumber
    ): Promise<ExactAmountOutPreview> => {
        try {
            this.setPreviewPending(true);
            const { tokenStore, providerStore } = this.rootStore;
            const { chainId } = providerStore.getActiveWeb3React();

            let maxPrice = helpers.setPropertyToMaxUintIfEmpty();
            let maxAmountIn = helpers.setPropertyToMaxUintIfEmpty();

            // Use WETH address for Ether
            const tokenInToFind =
                tokenIn === EtherKey
                    ? tokenStore.getWethAddress(chainId)
                    : tokenIn;
            const tokenOutToFind =
                tokenOut === EtherKey
                    ? tokenStore.getWethAddress(chainId)
                    : tokenOut;

            const poolData = await findPoolsWithTokens(
                tokenInToFind,
                tokenOutToFind,
                true
            );
            const costOutputToken = this.costCalculator.getCostOutputToken();

            let sorSwaps: SorSwaps = findBestSwaps(
                poolData,
                SwapMethods.EXACT_OUT,
                outputAmount,
                20,
                costOutputToken
            );

            const swaps = formatSwapsExactAmountOut(
                sorSwaps,
                poolData,
                bnum(maxPrice),
                bnum(maxAmountIn)
            );

            const totalInput = calcTotalInput(
                swaps,
                poolData,
                maxPrice,
                maxAmountIn
            );

            const totalInputSpot = calcTotalSpotValue(
                SwapMethods.EXACT_OUT,
                swaps,
                poolData
            );

            const spotPrice = calcPrice(bnum(outputAmount), totalInputSpot);

            console.log('[Spot Price Calc]', {
                outputAmount: outputAmount.toString(),
                totalInputSpot: totalInputSpot.toString(),
            });

            const effectivePrice = this.calcEffectivePrice(
                bnum(outputAmount),
                helpers.scale(totalInput, Scale.fromWei)
            );

            printDebugInfo(
                {
                    method: SwapMethods.EXACT_OUT,
                    tokenIn,
                    tokenOut,
                    outputAmount,
                    maxPrice: bnum(0),
                },
                swaps,
                sorSwaps,
                poolData,
                totalInput,
                effectivePrice
            );

            if (totalInput.isNaN()) {
                throw new Error('NaN total calculated input');
            }

            this.setPreviewPending(false);
            return {
                outputAmount,
                totalInput,
                effectivePrice,
                spotPrice,
                swaps,
                validSwap: true,
            };
        } catch (e) {
            log.error('[Error] previewSwapExactAmountOut', e);
            this.setPreviewPending(false);
            return {
                outputAmount,
                totalInput: null,
                effectivePrice: null,
                spotPrice: null,
                swaps: null,
                validSwap: false,
                error: e.message,
            };
        }
    };
}