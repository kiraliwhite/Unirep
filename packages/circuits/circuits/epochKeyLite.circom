pragma circom 2.0.0;

include "./circomlib/circuits/bitify.circom";
include "./circomlib/circuits/comparators.circom";
include "./hasher.circom";

template EpochKeyLite(EPOCH_KEY_NONCE_PER_EPOCH) {
    assert(EPOCH_KEY_NONCE_PER_EPOCH < 2**8);

    var NONCE_BITS = 8;
    var ATTESTER_ID_BITS = 160;
    var EPOCH_BITS = 48;

    signal input identity_secret;

    signal input reveal_nonce;
    signal input attester_id;
    signal input epoch;
    signal input nonce;

    signal input sig_data;
    // dummy square to ensure constraint
    signal sig_data_square <== sig_data * sig_data;

    signal output control;
    signal output epoch_key;

    /**
     * Control structure
     * 8 bits nonce
     * 64 bits epoch
     * 160 bits attester_id
     * 1 bit reveal nonce
     **/

    // check that reveal_nonce is 0 or 1
    reveal_nonce * (reveal_nonce - 1) === 0;

    // then range check the others

    component attester_id_check = Num2Bits(ATTESTER_ID_BITS);
    attester_id_check.in <== attester_id;

    component epoch_bits = Num2Bits(EPOCH_BITS);
    epoch_bits.in <== epoch;

    component nonce_range_check = Num2Bits(NONCE_BITS);
    nonce_range_check.in <== nonce;

    component nonce_lt = LessThan(NONCE_BITS);
    nonce_lt.in[0] <== nonce;
    nonce_lt.in[1] <== EPOCH_KEY_NONCE_PER_EPOCH;
    nonce_lt.out === 1;

    control <== reveal_nonce * 2**(NONCE_BITS + EPOCH_BITS + ATTESTER_ID_BITS) + attester_id * 2**(NONCE_BITS + EPOCH_BITS) + epoch * 2**NONCE_BITS + reveal_nonce * nonce;

    component epoch_key_hasher = EpochKeyHasher();
    epoch_key_hasher.identity_secret <== identity_secret;
    epoch_key_hasher.attester_id <== attester_id;
    epoch_key_hasher.epoch <== epoch;
    epoch_key_hasher.nonce <== nonce;

    epoch_key <== epoch_key_hasher.out;
}
