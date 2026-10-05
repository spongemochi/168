export const CHUNK=24000;
export function chunkAt(bytes,index){return bytes.slice(index*CHUNK,(index+1)*CHUNK);}
export function resumeIndex(info,file){
 const size=Number(info[0]),hash=String(info[2]).toLowerCase(),count=Number(info[4]);
 if(count===0)return 0;
 if(hash!==file.sha256.toLowerCase())return 0;
 if(size>file.bytes||count>file.chunks||size!==Math.min(file.bytes,count*CHUNK))throw Error('链上分块大小异常，请人工核对：'+file.path);
 return count;
}
export function compareBytes(actual,expected){return actual.length===expected.length&&actual.every((byte,i)=>byte===expected[i]);}
