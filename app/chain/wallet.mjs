import {assertXLayer} from './xlayer-identity.mjs';

const XLAYER_HEX='0xc4';
const XLAYER_CONFIG=Object.freeze({
  chainId:XLAYER_HEX,chainName:'X Layer',
  nativeCurrency:{name:'OKB',symbol:'OKB',decimals:18},
  rpcUrls:['https://rpc.xlayer.tech'],
  blockExplorerUrls:['https://www.oklink.com/xlayer'],
});
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;

export function findInjectedWallet(browser=globalThis){
  const eth=browser.ethereum;
  const candidates=[browser.okxwallet,...(Array.isArray(eth?.providers)?eth.providers:[]),eth].filter(p=>p&&typeof p.request==='function');
  return candidates.find(p=>p.isOkxWallet||p.isOKExWallet)||candidates[0]||null;
}

export async function connectXLayer(provider){
  if(!provider||typeof provider.request!=='function')throw new Error('没有检测到浏览器钱包。');
  const accounts=await provider.request({method:'eth_requestAccounts'});
  if(!Array.isArray(accounts)||!ADDRESS.test(accounts[0]||''))throw new Error('钱包没有返回有效地址。');
  try{await assertXLayer(provider);}catch(error){
    if(error.code!=='wrong-chain')throw error;
    try{await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:XLAYER_HEX}]});}
    catch(switchError){
      if(switchError?.code!==4902)throw switchError;
      await provider.request({method:'wallet_addEthereumChain',params:[XLAYER_CONFIG]});
    }
    await assertXLayer(provider);
  }
  return {provider,address:accounts[0].toLowerCase(),chainId:196};
}

export async function authorizedAccount(provider){
  if(!provider||typeof provider.request!=='function')return null;
  const accounts=await provider.request({method:'eth_accounts'});
  return Array.isArray(accounts)&&ADDRESS.test(accounts[0]||'')?accounts[0].toLowerCase():null;
}
