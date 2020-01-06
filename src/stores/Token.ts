import { action, observable, ObservableMap } from 'mobx';
import RootStore from 'stores/Root';
import { ContractTypes } from 'stores/Provider';
import * as helpers from 'utils/helpers';
import { parseEther } from 'ethers/utils';
import * as deployed from 'deployed.json';
import { FetchCode } from './Transaction';
import { BigNumber } from 'ethers/utils';
import { chainNameById } from '../provider/connectors';

export interface ContractMetadata {
    bFactory: string;
    proxy: string;
    tokens: TokenMetadata[];
}

export interface ContractMetadataMap {
    [index: number]: ContractMetadata;
}

interface TokenBalanceMap {
    [index: string]: UserBalanceMap;
}

interface UserBalanceMap {
    [index: string]: BigNumber;
}

export interface TokenMetadata {
    address: string;
    symbol: string;
    decimals: number;
}

interface UserAllowanceMap {
    [index: string]: {
        [index: string]: {
            [index: string]: BigNumber;
        };
    };
}

export default class TokenStore {
    @observable symbols = {};
    @observable balances: ObservableMap<number, TokenBalanceMap>;
    @observable allowances: ObservableMap<number, UserAllowanceMap>;
    @observable contractMetadata: ContractMetadataMap;
    rootStore: RootStore;

    constructor(rootStore, networkIds) {
        this.rootStore = rootStore;
        this.balances = new ObservableMap<number, TokenBalanceMap>();
        this.allowances = new ObservableMap<number, UserAllowanceMap>();
        this.contractMetadata = {};

        networkIds.forEach(networkId => {
            this.balances.set(networkId, {});
            this.allowances.set(networkId, {});
            this.loadWhitelistedTokenMetadata(networkId);
        });
    }

    // Take the data from the JSON and get it into the store, so we access it just like other data

    // network -> contrants -> tokens -> tokens[a] = TokenMetadata
    @action loadWhitelistedTokenMetadata(chainId: number) {
        const chainName = chainNameById[chainId];
        console.log(chainName === 'kovan');
        console.log({ chainName, metadata: deployed['kovan'], deployed });
        const tokenMetadata = deployed['kovan'].tokens;
        console.log(tokenMetadata);

        const contractMetadata = {
            bFactory: deployed['kovan'].bFactory,
            proxy: deployed['kovan'].proxy,
            tokens: [] as TokenMetadata[],
        };

        tokenMetadata.forEach(token => {
            const { address, symbol, decimals } = token;
            contractMetadata.tokens.push({
                address,
                symbol,
                decimals,
            });
        });

        this.contractMetadata[chainId] = contractMetadata;
    }

    getProxyAddress(chainId): string {
        const proxyAddress = this.contractMetadata[chainId].proxy;
        if (!proxyAddress) {
            throw new Error(
                '[Invariant] Trying to get non-loaded static address'
            );
        }
        return proxyAddress;
    }

    getWhitelistedTokenMetadata(chainId): TokenMetadata[] {
        const contractMetadata = this.contractMetadata[chainId];

        if (!contractMetadata) {
            throw new Error(
                'Attempting to get whitelisted tokens for untracked chainId'
            );
        }

        return contractMetadata.tokens;
    }

    setAllowanceProperty(
        chainId: number,
        tokenAddress: string,
        owner: string,
        spender: string,
        approval: BigNumber
    ): void {
        const chainApprovals = this.allowances.get(chainId);
        if (!chainApprovals) {
            throw new Error(
              'Attempt to set balance property for untracked chainId'
            );
        }

        if (!chainApprovals[tokenAddress]) {
            chainApprovals[tokenAddress] = {};
        }

        if (!chainApprovals[tokenAddress][owner]) {
            chainApprovals[tokenAddress][owner] = {};
        }

        chainApprovals[tokenAddress][owner][spender] = approval;
        this.allowances.set(chainId, chainApprovals);
    }

    setBalanceProperty(
        chainId: number,
        tokenAddress: string,
        account: string,
        balance: BigNumber
    ): void {
        const chainBalances = this.balances.get(chainId);
        if (!chainBalances) {
            throw new Error(
                'Attempt to set balance property for untracked chainId'
            );
        }

        if (!chainBalances[tokenAddress]) {
            chainBalances[tokenAddress] = {};
        }

        chainBalances[tokenAddress][account] = balance;
        this.balances.set(chainId, chainBalances);
    }

    getBalance(chainId, tokenAddress, account): BigNumber | undefined {
        const chainBalances = this.balances.get(chainId);
        if (chainBalances) {
            const tokenBalances = chainBalances[tokenAddress];
            if (tokenBalances) {
                const balance = tokenBalances[account];
                if (balance) {
                    return balance;
                }
            }
        }
        return undefined;
    }

    @action approveMax = async (tokenAddress, spender) => {
        const { providerStore } = this.rootStore;
        await providerStore.sendTransaction(
            ContractTypes.TestToken,
            tokenAddress,
            'approve',
            [spender, helpers.MAX_UINT.toString()]
        );
    };

    @action revokeApproval = async (tokenAddress, spender) => {
        const { providerStore } = this.rootStore;
        await providerStore.sendTransaction(
            ContractTypes.TestToken,
            tokenAddress,
            'approve',
            [spender, 0]
        );
    };

    @action fetchBalancerTokenData = async (
        account,
        chainId
    ): Promise<FetchCode> => {
        const tokensToTrack = this.getWhitelistedTokenMetadata(chainId);

        const promises: Promise<any>[] = [];
        //TODO: Promise.all
        tokensToTrack.forEach((value, index) => {
            promises.push(this.fetchBalanceOf(chainId, value.address, account));
            promises.push(
                this.fetchAllowance(
                    chainId,
                    value.address,
                    account,
                    this.contractMetadata[chainId].proxy
                )
            );
        });

        try {
            await Promise.all(promises);
        } catch (e) {
            console.error('[Fetch] Balancer Token Data', { error: e });
            return FetchCode.FAILURE;
        }
        return FetchCode.SUCCESS;
    };

    @action fetchSymbol = async tokenAddress => {
        const { providerStore } = this.rootStore;
        const token = providerStore.getContract(
            ContractTypes.TestToken,
            tokenAddress
        );
        this.symbols[tokenAddress] = await token.symbol().call();
    };

    @action fetchEtherBalance = async (tokenAddress, account) => {};

    @action fetchBalanceOf = async (chainId, tokenAddress, account) => {
        const { providerStore } = this.rootStore;
        const token = providerStore.getContract(
            ContractTypes.TestToken,
            tokenAddress
        );

        const balance = await token.balanceOf(account);
        this.setBalanceProperty(chainId, tokenAddress, account, balance);
    };

    @action mint = async (tokenAddress: string, amount: string) => {
        const { providerStore } = this.rootStore;
        await providerStore.sendTransaction(
            ContractTypes.TestToken,
            tokenAddress,
            'mint',
            [parseEther(amount).toString()]
        );
    };

    @action fetchAllowance = async (
        chainId,
        tokenAddress,
        account,
        spender
    ) => {
        const { providerStore } = this.rootStore;
        const token = providerStore.getContract(
            ContractTypes.TestToken,
            tokenAddress
        );

        const allowance = await token.allowance(account, spender);

        this.setAllowanceProperty(
            chainId,
            tokenAddress,
            account,
            spender,
            allowance
        );

        console.log('Allowance Property Set', {
            tokenAddress,
            account,
            spender,
            allowance,
        });
    };

    getAllowance = (
        chainId,
        tokenAddress,
        account,
        spender
    ): BigNumber | undefined => {
        const chainApprovals = this.allowances.get(chainId);
        if (chainApprovals) {
            const tokenApprovals = chainApprovals[tokenAddress];
            if (tokenApprovals) {
                const userApprovals = tokenApprovals[account];
                if (userApprovals) {
                    return userApprovals[spender];
                }
            }
        }
        return undefined;
    };
}
