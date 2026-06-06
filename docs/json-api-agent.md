# JSON API Request

Fetches JSON data from any public API endpoint and extracts specific values using a selector path. This agent is the fundamental building block for creating on-chain oracles.

## Methods

| Function           | Inputs                  | Output     | Use Case                     |
| ------------------ | ----------------------- | ---------- | ---------------------------- |
| `fetchString`      | url, selector           | string     | Text values, names           |
| `fetchUint`        | url, selector, decimals | uint256    | Prices, positive numbers     |
| `fetchInt`         | url, selector, decimals | int256     | Temperatures, signed numbers |
| `fetchBool`        | url, selector           | bool       | Flags, status checks         |
| `fetchStringArray` | url, selector           | string\[]  | Lists of names/IDs           |
| `fetchUintArray`   | url, selector, decimals | uint256\[] | Price lists, numeric arrays  |

## Parameters

| Input      | Type   | Description                                                                              |
| ---------- | ------ | ---------------------------------------------------------------------------------------- |
| `url`      | string | The URL of the JSON API endpoint to fetch                                                |
| `selector` | string | A dot-notation path to extract from the response (e.g., `data.price` or `items[0].name`) |
| `decimals` | uint8  | Number of decimal places to scale the value by (multiplies by 10^decimals)               |

### Decimal Scaling

The `decimals` parameter is used by `fetchUint`, `fetchInt`, and `fetchUintArray` to convert floating-point values from APIs into blockchain-compatible integers. The value is multiplied by 10^decimals.

For example, with `decimals=8`:

* `42000.50` becomes `4200050000000`
* `0.00001234` becomes `1234`

This follows the standard pattern for handling decimals in smart contracts (e.g., ERC-20 tokens typically use 18 decimals).

## Method Signatures

```solidity
function fetchString(string url, string selector) returns (string)
function fetchUint(string url, string selector, uint8 decimals) returns (uint256)
function fetchInt(string url, string selector, uint8 decimals) returns (int256)
function fetchBool(string url, string selector) returns (bool)
function fetchStringArray(string url, string selector) returns (string[])
function fetchUintArray(string url, string selector, uint8 decimals) returns (uint256[])
```

## Example Use Cases

* Fetching cryptocurrency prices from CoinGecko or similar APIs
* Retrieving weather data for parametric insurance contracts
* Pulling sports scores for prediction markets
* Accessing any REST API that returns JSON

## Usage Examples

### Fetch a Price as uint256

```javascript
import { encodeFunctionData } from 'viem';

const abi = [{
  type: 'function',
  name: 'fetchUint',
  inputs: [
    { name: 'url', type: 'string' },
    { name: 'selector', type: 'string' },
    { name: 'decimals', type: 'uint8' }
  ],
  outputs: [{ name: 'result', type: 'uint256' }]
}];

// Fetch Bitcoin price with 8 decimal places
const calldata = encodeFunctionData({
  abi,
  functionName: 'fetchUint',
  args: [
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
    'bitcoin.usd',
    8
  ]
});
```

### Fetch a String Value

```javascript
const abi = [{
  type: 'function',
  name: 'fetchString',
  inputs: [
    { name: 'url', type: 'string' },
    { name: 'selector', type: 'string' }
  ],
  outputs: [{ name: 'result', type: 'string' }]
}];

// Fetch a token symbol
const calldata = encodeFunctionData({
  abi,
  functionName: 'fetchString',
  args: [
    'https://api.example.com/token/info',
    'data.symbol'
  ]
});
```

### Fetch a Boolean Value

```javascript
const abi = [{
  type: 'function',
  name: 'fetchBool',
  inputs: [
    { name: 'url', type: 'string' },
    { name: 'selector', type: 'string' }
  ],
  outputs: [{ name: 'result', type: 'bool' }]
}];

// Check if a market is open
const calldata = encodeFunctionData({
  abi,
  functionName: 'fetchBool',
  args: [
    'https://api.example.com/market/status',
    'isOpen'
  ]
});
```
