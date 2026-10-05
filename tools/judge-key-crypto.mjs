// A portable encrypted backup for the 168 judge's X25519 receive key.
const bytesToHex=bytes=>'0x'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const hexToBytes=hex=>{
  if(typeof hex!=='string'||!/^0x(?:[0-9a-fA-F]{2})+$/.test(hex))throw Error('备份数据格式无效。');
  return Uint8Array.from(hex.slice(2).match(/../g),x=>parseInt(x,16));
};
const text=new TextEncoder();
const iterations=250000;
async function aesKey(passphrase,salt,usage){
  if(typeof passphrase!=='string'||[...passphrase].length<12)throw Error('备份密码至少需要 12 个字符。');
  const base=await crypto.subtle.importKey('raw',text.encode(passphrase),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,[usage]);
}
export async function encryptJudgeKey(secretKey,meta,passphrase){
  if(!(secretKey instanceof Uint8Array)||secretKey.length!==32)throw Error('判官密钥长度无效。');
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await aesKey(passphrase,salt,'encrypt');
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,secretKey));
  return {format:'168-judge-key-backup-v1',chainId:196,...meta,kdf:{name:'PBKDF2',hash:'SHA-256',iterations,salt:bytesToHex(salt)},cipher:{name:'AES-256-GCM',iv:bytesToHex(iv),ciphertext:bytesToHex(ciphertext)}};
}
export async function decryptJudgeKey(backup,passphrase){
  if(backup?.format!=='168-judge-key-backup-v1'||backup.chainId!==196||backup.kdf?.name!=='PBKDF2'||backup.kdf?.hash!=='SHA-256'||backup.kdf?.iterations!==iterations||backup.cipher?.name!=='AES-256-GCM')throw Error('这不是受支持的 168 判官密钥备份。');
  const salt=hexToBytes(backup.kdf.salt),iv=hexToBytes(backup.cipher.iv),ciphertext=hexToBytes(backup.cipher.ciphertext);
  if(salt.length!==16||iv.length!==12||ciphertext.length!==48)throw Error('判官密钥备份长度无效。');
  const key=await aesKey(passphrase,salt,'decrypt');
  let secret;
  try{secret=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv},key,ciphertext));}
  catch{throw Error('备份密码不正确，或文件已损坏。');}
  if(secret.length!==32)throw Error('解密后的判官密钥长度无效。');
  return secret;
}
