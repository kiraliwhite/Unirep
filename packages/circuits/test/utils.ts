// The reason for the ts-ignore below is that if we are executing the code via `ts-node` instead of `hardhat`,
// it can not read the hardhat config and error ts-2503 will be reported.
// @ts-ignore
import assert from 'assert'
import { ethers } from 'ethers'
import * as crypto from '@unirep/crypto'

import {
    Circuit,
    EPOCH_TREE_DEPTH,
    STATE_TREE_DEPTH,
    NUM_ATTESTATIONS_PER_PROOF,
    NUM_EPOCH_KEY_NONCE_PER_EPOCH,
} from '../src'
import { defaultProver } from '../provers/defaultProver'
import { expect } from 'chai'

const SMT_ZERO_LEAF = crypto.hashLeftRight(BigInt(0), BigInt(0))
const SMT_ONE_LEAF = crypto.hashLeftRight(BigInt(1), BigInt(0))

interface IAttestation {
    attesterId: bigint
    posRep: bigint
    negRep: bigint
    graffiti: bigint
    signUp: bigint
    hash: bigint | string
}

class Attestation implements IAttestation {
    public attesterId: bigint
    public posRep: bigint
    public negRep: bigint
    public graffiti: bigint
    public signUp: bigint

    constructor(
        _attesterId: bigint,
        _posRep: bigint,
        _negRep: bigint,
        _graffiti: bigint,
        _signUp: bigint
    ) {
        this.attesterId = _attesterId
        this.posRep = _posRep
        this.negRep = _negRep
        this.graffiti = _graffiti
        this.signUp = _signUp
    }

    get hash() {
        return crypto.hash5([
            this.attesterId,
            this.posRep,
            this.negRep,
            this.graffiti,
            this.signUp,
        ])
    }

    public toJSON = (space = 0): string => {
        return JSON.stringify(
            {
                attesterId: this.attesterId.toString(),
                posRep: this.posRep.toString(),
                negRep: this.negRep.toString(),
                graffiti: this.graffiti.toString(),
                signUp: this.signUp.toString(),
            },
            null,
            space
        )
    }
}

interface IReputation {
    posRep: bigint
    negRep: bigint
    graffiti: bigint
    signUp: bigint
}

class Reputation implements IReputation {
    public posRep: bigint
    public negRep: bigint
    public graffiti: bigint
    public graffitiPreImage: bigint = BigInt(0)
    public signUp: bigint

    constructor(
        _posRep: bigint,
        _negRep: bigint,
        _graffiti: bigint,
        _signUp: bigint
    ) {
        this.posRep = _posRep
        this.negRep = _negRep
        this.graffiti = _graffiti
        this.signUp = _signUp
    }

    public static default(): Reputation {
        return new Reputation(BigInt(0), BigInt(0), BigInt(0), BigInt(0))
    }

    public update = (
        _posRep: bigint,
        _negRep: bigint,
        _graffiti: bigint,
        _signUp: bigint
    ): Reputation => {
        this.posRep = this.posRep + _posRep
        this.negRep = this.negRep + _negRep
        if (_graffiti != BigInt(0)) {
            this.graffiti = _graffiti
        }
        this.signUp = this.signUp || _signUp
        return this
    }

    public addGraffitiPreImage = (_graffitiPreImage: bigint) => {
        assert(
            crypto.hashOne(_graffitiPreImage) === this.graffiti,
            'Graffiti pre-image does not match'
        )
        this.graffitiPreImage = _graffitiPreImage
    }

    public hash = (): bigint => {
        return crypto.hash5([
            this.posRep,
            this.negRep,
            this.graffiti,
            this.signUp,
            BigInt(0),
        ])
    }

    public toJSON = (space = 0): string => {
        return JSON.stringify(
            {
                posRep: this.posRep.toString(),
                negRep: this.negRep.toString(),
                graffiti: this.graffiti.toString(),
                graffitiPreImage: this.graffitiPreImage.toString(),
                signUp: this.signUp.toString(),
            },
            null,
            space
        )
    }
}

const toCompleteHexString = (str: string, len?: number): string => {
    str = str.startsWith('0x') ? str : '0x' + str
    if (len) str = ethers.utils.hexZeroPad(str, len)
    return str
}

const genNewSMT = (treeDepth: number, defaultLeafHash: bigint = BigInt(0)) => {
    return new crypto.SparseMerkleTree(treeDepth, defaultLeafHash)
}

const genNewEpochTree = (_epochTreeDepth: number = EPOCH_TREE_DEPTH) => {
    const defaultLeaf = crypto.hash4([
        BigInt(0),
        BigInt(0),
        BigInt(0),
        BigInt(0),
    ])
    return genNewSMT(_epochTreeDepth, defaultLeaf)
}

// TODO: needs to be updated
const genEpochKey = (
    identityNullifier: bigint,
    attesterId: number,
    epoch: number,
    nonce: number,
    _epochTreeDepth: number = EPOCH_TREE_DEPTH
): bigint => {
    const epochKey = crypto.hash4([
        identityNullifier,
        BigInt(attesterId),
        epoch,
        nonce,
    ])
    // Adjust epoch key size according to epoch tree depth
    const epochKeyModed = epochKey % BigInt(2 ** _epochTreeDepth)
    return epochKeyModed
}

const genEpochKeyCircuitInput = (config: {
    id: crypto.ZkIdentity
    tree: crypto.IncrementalMerkleTree
    leafIndex: number
    epoch: number
    nonce: number
    attesterId: number
    posRep: number
    negRep: number
    graffiti: number | bigint
    timestamp: number | bigint
    hash?: bigint
}) => {
    const {
        id,
        tree,
        leafIndex,
        epoch,
        nonce,
        attesterId,
        posRep,
        negRep,
        graffiti,
        timestamp,
        hash,
    } = config
    const proof = tree.createProof(leafIndex)
    const circuitInputs = {
        state_tree_elements: proof.siblings,
        state_tree_indexes: proof.pathIndices,
        identity_nullifier: id.identityNullifier,
        nonce: nonce,
        epoch: epoch,
        pos_rep: posRep,
        neg_rep: negRep,
        graffiti,
        timestamp,
        attester_id: attesterId,
        hash: hash ?? BigInt(0),
    }
    return crypto.stringifyBigInts(circuitInputs)
}

const genUserStateTransitionCircuitInput = (config: {
    id: crypto.ZkIdentity
    fromEpoch: number
    toEpoch: number
    tree: crypto.IncrementalMerkleTree
    leafIndex: number
    attesterId: number
    startBalance: { posRep: any; negRep: any; graffiti: any; timestamp: any }
    epochKeyBalances?: {
        [key: string]: {
            posRep: number
            negRep: number
            graffiti?: any
            timestamp?: any
        }
    }
}) => {
    const {
        id,
        fromEpoch,
        toEpoch,
        attesterId,
        startBalance,
        tree,
        leafIndex,
        epochKeyBalances,
    } = Object.assign(
        {
            epochKeyBalances: {},
        },
        config
    )
    const epochTree = genNewEpochTree(EPOCH_TREE_DEPTH)
    for (const [key, val] of Object.entries(epochKeyBalances)) {
        const { posRep, negRep, graffiti, timestamp } = val
        epochTree.update(
            BigInt(key),
            crypto.hash4([posRep, negRep, graffiti ?? 0, timestamp ?? 0])
        )
    }
    const epochKeys = Array(NUM_EPOCH_KEY_NONCE_PER_EPOCH)
        .fill(null)
        .map((_, i) =>
            genEpochKey(
                id.identityNullifier,
                attesterId,
                fromEpoch,
                i,
                EPOCH_TREE_DEPTH
            )
        )

    const stateTreeProof = tree.createProof(leafIndex)
    const circuitInputs = {
        from_epoch: fromEpoch,
        to_epoch: toEpoch,
        identity_nullifier: id.identityNullifier,
        state_tree_indexes: stateTreeProof.pathIndices,
        state_tree_elements: stateTreeProof.siblings,
        attester_id: attesterId,
        pos_rep: startBalance.posRep,
        neg_rep: startBalance.negRep,
        graffiti: startBalance.graffiti,
        timestamp: startBalance.timestamp,
        new_pos_rep: epochKeys.map(
            (k) => epochKeyBalances[k.toString()]?.posRep ?? BigInt(0)
        ),
        new_neg_rep: epochKeys.map(
            (k) => epochKeyBalances[k.toString()]?.negRep ?? BigInt(0)
        ),
        new_graffiti: epochKeys.map(
            (k) => epochKeyBalances[k.toString()]?.graffiti ?? BigInt(0)
        ),
        new_timestamp: epochKeys.map(
            (k) => epochKeyBalances[k.toString()]?.timestamp ?? BigInt(0)
        ),
        epoch_tree_elements: epochKeys.map((k) => epochTree.createProof(k)),
        epoch_tree_root: epochTree.root,
    }
    return crypto.stringifyBigInts(circuitInputs)
}

const genReputationCircuitInput = (config: {
    id: crypto.ZkIdentity
    epoch: number
    nonce: number
    attesterId: number
    startBalance: { posRep: any; negRep: any; graffiti?: any; timestamp?: any }
    minRep?: number
    proveGraffiti?: boolean
    graffitiPreImage?: any
}) => {
    const {
        id,
        epoch,
        nonce,
        attesterId,
        startBalance,
        minRep,
        proveGraffiti,
        graffitiPreImage,
    } = Object.assign(
        {
            minRep: 0,
            graffitiPreImage: 0,
        },
        config
    )

    // Global state tree
    const stateTree = new crypto.IncrementalMerkleTree(STATE_TREE_DEPTH)
    const hashedLeaf = crypto.hash7([
        id.identityNullifier,
        attesterId,
        epoch,
        startBalance.posRep,
        startBalance.negRep,
        startBalance.graffiti ?? 0,
        startBalance.timestamp ?? 0,
    ])
    stateTree.insert(hashedLeaf)
    const stateTreeProof = stateTree.createProof(0) // if there is only one GST leaf, the index is 0

    const circuitInputs = {
        epoch: epoch,
        nonce,
        identity_nullifier: id.identityNullifier,
        state_tree_indexes: stateTreeProof.pathIndices,
        state_tree_elements: stateTreeProof.siblings,
        attester_id: attesterId,
        pos_rep: startBalance.posRep,
        neg_rep: startBalance.negRep,
        graffiti: startBalance.graffiti ?? 0,
        timestamp: startBalance.timestamp ?? 0,
        min_rep: minRep,
        prove_graffiti: proveGraffiti ? 1 : 0,
        graffiti_pre_image: graffitiPreImage,
    }
    return crypto.stringifyBigInts(circuitInputs)
}

const genProofAndVerify = async (circuit: Circuit, circuitInputs: any) => {
    const startTime = new Date().getTime()
    const { proof, publicSignals } =
        await defaultProver.genProofAndPublicSignals(circuit, circuitInputs)
    const endTime = new Date().getTime()
    console.log(
        `Gen Proof time: ${endTime - startTime} ms (${Math.floor(
            (endTime - startTime) / 1000
        )} s)`
    )
    const isValid = await defaultProver.verifyProof(
        circuit,
        publicSignals,
        proof
    )
    return { isValid, proof, publicSignals }
}

const genUserStateTransitionNullifier = (
    identityNullifier: bigint,
    epoch: number,
    attesterId: number
): bigint => {
    return crypto.hash3([BigInt(attesterId), BigInt(epoch), identityNullifier])
}

export {
    Attestation,
    Reputation,
    SMT_ONE_LEAF,
    SMT_ZERO_LEAF,
    genNewEpochTree,
    genNewSMT,
    toCompleteHexString,
    genEpochKey,
    genEpochKeyCircuitInput,
    genReputationCircuitInput,
    genUserStateTransitionCircuitInput,
    genUserStateTransitionNullifier,
    genProofAndVerify,
}
