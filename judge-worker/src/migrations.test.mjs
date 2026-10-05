import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

test('scoring migration preserves pending signed transactions and their uniqueness constraints',()=>{
  const sql=new DatabaseSync(':memory:');
  const migrate=name=>sql.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  try{
    sql.exec('PRAGMA foreign_keys=ON');
    for(const name of ['0001_init.sql','0002_safe_timestamp.sql','0003_judge_jobs.sql','0004_executor.sql'])migrate(name);
    sql.exec("INSERT INTO cases (id,inbox_index,author_endpoint,author_container,kind,open_time,commitment_ref,payload_hex,committed_block,committed_at) VALUES ('case',0,'author','container','forecast',3000,'ref','sealed',99,1800)");
    sql.exec("INSERT INTO judge_transactions VALUES ('case','reveal','signer',7,'hash','signed-payload','100','broadcast',1800,1801,3,'timeout')");
    const before=sql.prepare('SELECT * FROM judge_transactions').get();
    migrate('0005_scoring.sql');migrate('0006_history_cache.sql');
    assert.deepEqual(sql.prepare('SELECT * FROM judge_transactions').get(),before);
    assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
    const insert=sql.prepare("INSERT INTO judge_transactions (case_id,type,signer,nonce,tx_hash,raw_tx,max_fee_wei,created_at,updated_at) VALUES ('case',?,'signer',?,?,'raw','100',1802,1802)");
    insert.run('receipt',8,'hash2');insert.run('parameters',9,'hash3');
    assert.throws(()=>insert.run('verdict',7,'hash4'),/UNIQUE/);
    assert.throws(()=>insert.run('verdict',10,'hash'),/UNIQUE/);
    assert.throws(()=>insert.run('unknown',10,'hash4'),/CHECK/);
    assert.throws(()=>insert.run('receipt',10,'hash4'),/UNIQUE/);
    assert.equal(sql.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='judge_transactions_pending'").get().name,'judge_transactions_pending');
  }finally{sql.close();}
});
