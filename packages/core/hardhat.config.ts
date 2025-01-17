import { HardhatUserConfig } from 'hardhat/config'
import '@nomiclabs/hardhat-ethers'
import 'hardhat-gas-reporter'
import '@nomicfoundation/hardhat-chai-matchers'

const config: HardhatUserConfig = {
    defaultNetwork: 'hardhat',
    networks: {
        hardhat: {
            blockGasLimit: 12000000,
        },
        local: {
            url: 'http://localhost:8545',
        },
    },
    solidity: {
        compilers: [
            {
                version: '0.8.17',
                settings: {
                    optimizer: { enabled: true, runs: 2 ** 32 - 1 },
                },
            },
        ],
    },
    gasReporter: {
        enabled: process.env.REPORT_GAS ? true : false,
    },
}

export default config
