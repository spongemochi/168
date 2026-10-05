// Report the operation name, without logging request arguments or receive keys.
export async function operation(name,run){
  try{return await run();}catch(error){throw Error('['+name+'] '+String(error.message||error));}
}
