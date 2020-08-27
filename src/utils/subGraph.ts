import fetch from 'isomorphic-fetch';
import { getAllPublicSwapPoolsBackup } from '../utils/poolsBackup';

const SUBGRAPH_URL =
    process.env.REACT_APP_SUBGRAPH_URL ||
    'https://api.thegraph.com/subgraphs/name/balancer-labs/balancer';

// Returns all public pools
export async function getAllPublicSwapPools() {
    let pools = { pools: [] };
    try {
        pools = await getSubgraphPools();
        if (pools.pools.length === 0) {
            console.log(
                `[SubGraph] Load Error - No Pools Returned. Defaulting To Backup List.`
            );
            pools = getAllPublicSwapPoolsBackup();
        }
    } catch (error) {
        console.log(`[SubGraph] Load Error. Defaulting To Backup List.`);
        console.log(`[SubGraph] Error: ${error.message}`);
        pools = getAllPublicSwapPoolsBackup();
    }

    return pools;
}

async function getSubgraphPools() {
    const query = `
      {
          pools (first: 1000, where: {publicSwap: true, active: true}) {
            id
            swapFee
            totalWeight
            publicSwap
            tokens {
              id
              address
              balance
              decimals
              symbol
              denormWeight
            }
            tokensList
          }
      }
    `;

    const response = await fetch(SUBGRAPH_URL, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            query,
        }),
    });

    const { data } = await response.json();
    console.log(`[SubGraph] No Pools: ${data.pools.length}`);
    return data;
}
