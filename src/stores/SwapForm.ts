import { observable, action } from 'mobx';
import RootStore from 'stores/Root';
import * as deployed from 'deployed.json';

export const formNames = {
    INPUT_FORM: 'inputs',
};

export const labels = {
    inputs: {
        INPUT_TOKEN: 'Input Token',
        OUTPUT_TOKEN: 'Output Token',
        INPUT_AMOUNT: 'Input Amount',
        OUTPUT_AMOUNT: 'Output Amount',
    },
    outputs: {
        INPUT_AMOUNT: 'Input Amount',
        OUTPUT_AMOUNT: 'Output Amount',
        EFFECTIVE_PRICE: 'Effective Price',
        MARGINAL_PRICE: 'Marginal Price',
    },
};

export enum SwapMethods {
    EXACT_IN = 'exactIn',
    EXACT_OUT = 'exactOut'
}

export default class SwapFormStore {
    @observable inputs = {
        inputToken: '',
        outputToken: '',
        inputAmount: '',
        outputAmount: '',
        inputTicker: '',
        outputTicker: '',
        inputIconAddress: '',
        outputIconAddress: '',
        type: SwapMethods.EXACT_IN,
        outputLimit: '0',
        inputLimit: '0',
        limitPrice: '0',
        setBuyFocus: false,
        setSellFocus: false,
        effectivePrice: '',
        swaps: [],
    };
    @observable outputs = {
        inputAmount: '',
        outputAmount: '',
        effectivePrice: '',
        swaps: [],
        validSwap: false,
    };
    rootStore: RootStore;

    @action updateOutputsFromObject(output) {
        this.outputs = {
            ...this.outputs,
            ...output,
        };
    }

    @action updateInputsFromObject(output) {
        this.inputs = {
            ...this.inputs,
            ...output,
        };
    }

    resetInputs() {
        this.inputs = {
            ...this.inputs,
            inputAmount: '',
            outputAmount: '',
        };
    }

    resetOutputs() {
        this.outputs = {
            inputAmount: '',
            outputAmount: '',
            effectivePrice: '',
            swaps: [],
            validSwap: false,
        };
    }

    constructor(rootStore) {
        this.rootStore = rootStore;
    }
}
