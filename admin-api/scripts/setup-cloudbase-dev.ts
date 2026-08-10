import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { RepositoryService } from '../src/database/repository.service';
import { memoryScenics } from '../src/database/memory-seed';

const collections = ['scenic_areas','admin_users','admin_sessions','admin_audit_logs','admin_order_notes','financial_adjustments','vehicle_commands'];
function assertDevEnvironment() { const env = String(process.env.CLOUDBASE_ENV_ID || ''); if (!/(dev|test|staging|stage|local)/i.test(env) || /prod/i.test(env)) throw new Error('该脚本只允许名称明确包含 dev/test/staging 且不包含 prod 的 CloudBase 环境'); }
async function exists(db: any, collection: string, id: string) { try { const result=await db.collection(collection).doc(id).get(); return Array.isArray(result?.data)?result.data.length>0:Boolean(result?.data); } catch { return false; } }
async function main() {
  if (process.env.DATA_DRIVER !== 'cloudbase') throw new Error('请显式设置 DATA_DRIVER=cloudbase'); assertDevEnvironment();
  const repository=new RepositoryService(new ConfigService()); repository.initialize(); const db=repository.rawDatabase();
  for (const name of collections) { try { await db.createCollection(name); console.log(`created collection: ${name}`); } catch (error) { const message=String((error as any)?.message||error); if (!/(exist|already|Existed)/i.test(message)) throw error; console.log(`kept existing collection: ${name}`); } }
  for (const scenic of memoryScenics) { if (!(await exists(db,'scenic_areas',scenic.id))) { await db.collection('scenic_areas').doc(scenic.id).set({ ...scenic, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() }); console.log(`seeded scenic: ${scenic.id}`); } }
  console.log('集合与预配置景区已就绪。请按 cloudbase/schema/indexes.json 在控制台创建索引。');
}
main().catch((error)=>{console.error('[cloudbase-setup]',error instanceof Error?error.message:error);process.exitCode=1;});
