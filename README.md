# urLegacy.eth

***How activation/subscription works:**

(I) The user connects wallet and clicks on the "Program" button corresponding to the token they wish to be sent in the future to the designated crypto wallet address they input (heir, entity, AI agent, et cetera).

(II) The user inputs the receiving address.

(III) The user enters the beneficiary's name (this is the person or entity that should receive the funds). This is optional.

User pays $369 in ETH or in any stablecoin (DAI, GHO, USDC, USDT, etc) to activate the contract.

(IV) The user enters the subscription days (i.e., amount of days funds will be inside the contract). The maximum amount of days is 369 days.

Note: 
* When the subscription time comes to an end, the funds within the contract are sent to the wallet address designated by the user. 

* If the user reactivates the contract before the time-subscription ends, then the funds remain inside the contract and in their control, thus unds are not sent to designated address. The contract is reactivated by paying the corresponding fee for the time subscription.

The contract charges $1.00 from 1 to 10 days; $2 from 10 to 20 days and $3 from 20 to 30 days. After 30 days the contract charges $1 per day; however only up to 227 days the fee is charged... All rest of days selected from 227 days to 369 days are free of charge.

(V) The user enters the amount they wish to be sent to the heir/designated address.

(VI) The user enters their Sign Key (or quantum resistant Sign Key).

(VII) The user selects the token to pay the subscription-fee in order to activate the contract. The fee can be paid with ETH (by default) or with LINK, AAVE, GHO, DAI, USDC, and USDT.

(VIII) The user clicks on "Activate" button.

(IX) Once the contract is activated, the user can deposit more funds at any time during the active subscription; and the user can withdraw any amount and/or the full amount at any time.

(X) In the "Subscription" tab the user sees a green "Active" status which indicates the contract is active/operational.

(XI) An "Expired" status (in red) indicates: (A) the contract has sent the funds to the designated crypto wallet address, (B) the user withdrew to their own wallet, the duration of the contract came to a term and it was not renewed.

(XII) The Sign Key is always required before signing a Tx as it helps with preventing theft or any type of exploitation.

Example: (If it would be possible to activate a contracrt without the Sign Key), if the user activates a contract and a bad actor gains access to their private keys, the bad actor then can (A) withdraw the funds from the contract to the user/victim's wallet (that they have taken control over) and then send the funds to an address they control; (B) the bad actor can change the designated address and input an address they control so the funds would be received, ultimately, into the address they control.

Thus, the Sign Key stops that from happening as for the bad actor to be able to withdraw, or change the designated address they must have and input also the Sign Key. Without the Sign Key they have no control over the funds, but the legit owner does.

Thus, if by any chance, a bad actor would have gained access to the wallet's private keys of the user, the bad actor still would not be able to compromise/steal the user's funds.
