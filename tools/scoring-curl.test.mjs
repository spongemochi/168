import test from 'node:test';import assert from 'node:assert/strict';import {curlResponse} from './scoring-curl.mjs';
test('proxy diagnostics retain actual CORS headers and JSON without inventing browser access',async()=>{
 const response=curlResponse('HTTP/1.1 200 Connection established\r\n\r\nHTTP/2 200\r\ncontent-type: application/json\r\naccess-control-allow-origin: *\r\n\r\n{"ready":true}\n200');
 assert.equal(response.headers.get('access-control-allow-origin'),'*');assert.deepEqual(await response.json(),{ready:true});
 const denied=curlResponse('HTTP/2 404\r\ncontent-type: application/json\r\n\r\n{"error":"not found"}\n404');
 assert.equal(denied.status,404);assert.equal(denied.headers.get('access-control-allow-origin'),null);
});
