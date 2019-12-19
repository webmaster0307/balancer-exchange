import { BigNumber } from 'utils/bignumber';

const BONE = new BigNumber(10).pow(18);
const BPOW_PRECISION = BONE.idiv(10).pow(10);

export function calcOutGivenIn(
    tokenBalanceIn: BigNumber,
    tokenWeightIn: BigNumber,
    tokenBalanceOut: BigNumber,
    tokenWeightOut: BigNumber,
    tokenAmountIn: BigNumber,
    swapFee: BigNumber
): BigNumber {
    let weightRatio = bdiv(tokenWeightIn, tokenWeightOut);
    let adjustedIn = BONE.minus(swapFee);
    adjustedIn = bmul(tokenAmountIn, adjustedIn);
    let y = bdiv(tokenBalanceIn, tokenBalanceIn.plus(adjustedIn));
    let foo = bpow(y, weightRatio);
    let bar = BONE.minus(foo);
    let tokenAmountOut = bmul(tokenBalanceOut, bar);
    return tokenAmountOut;
}

export function calcInGivenOut(
    tokenBalanceIn: BigNumber,
    tokenWeightIn: BigNumber,
    tokenBalanceOut: BigNumber,
    tokenWeightOut: BigNumber,
    tokenAmountOut: BigNumber,
    swapFee: BigNumber
) {
    let weightRatio = bdiv(tokenWeightOut, tokenWeightIn);
    let diff = tokenBalanceOut.minus(tokenAmountOut);
    let y = bdiv(tokenBalanceOut, diff);
    let foo = bpow(y, weightRatio);
    let tokenAmountIn = BONE.minus(swapFee);
    tokenAmountIn = bdiv(bmul(tokenBalanceIn, foo), tokenAmountIn);
    return tokenAmountIn;
}

function bmul(a: BigNumber, b: BigNumber): BigNumber {
    let c0 = a.times(b);
    let c1 = c0.plus(BONE.div(2));
    let c2 = c1.idiv(BONE);
    return c2;
}

function bdiv(a: BigNumber, b: BigNumber): BigNumber {
    let c0 = a.times(BONE);
    let c1 = c0.plus(BONE.div(2));
    let c2 = c1.idiv(b);
    return c2;
}

function btoi(a: BigNumber): BigNumber {
    return a.idiv(BONE);
}

function bfloor(a: BigNumber): BigNumber {
    return btoi(a).times(BONE);
}

function bsubSign(a: BigNumber, b: BigNumber): {res: BigNumber, bool: boolean} {
    if (a.gte(b)) {
        let res = a.minus(b);
        let bool = false;
        return { res, bool };
    } else {
        let res = b.minus(a);
        let bool = true;
        return { res, bool };
    }
}

function bpowi(a: BigNumber, n: BigNumber): BigNumber {
    let z = !n.modulo(2).eq(0) ? a : BONE;

    for (n = n.idiv(2); !n.eq(0); n = n.idiv(2)) {
        a = bmul(a, a);
        if (!n.modulo(2).eq(0)) {
            z = bmul(z, a);
        }
    }
    return z;
}

function bpow(base: BigNumber, exp: BigNumber): BigNumber {
    let whole = bfloor(exp);
    let remain = exp.minus(whole);
    let wholePow = bpowi(base, btoi(whole));
    if (remain.eq(0)) {
        return wholePow;
    }

    let partialResult = bpowApprox(base, remain, BPOW_PRECISION);
    return bmul(wholePow, partialResult);
}

function bpowApprox(
    base: BigNumber,
    exp: BigNumber,
    precision: BigNumber
): BigNumber {
    let a = exp;
    let { res: x, bool: xneg } = bsubSign(base, BONE);
    let term = BONE;
    let sum = term;
    let negative = false;

    for (let i = 1; term.gte(precision); i++) {
        let bigK = new BigNumber(i).times(BONE);
        let { res: c, bool: cneg } = bsubSign(a, bigK.minus(BONE));
        term = bmul(term, bmul(c, x));
        term = bdiv(term, bigK);
        if (term.eq(0)) break;

        if (xneg) negative = !negative;
        if (cneg) negative = !negative;
        if (negative) {
            sum = sum.minus(term);
        } else {
            sum = sum.plus(term);
        }
    }

    return sum;
}
