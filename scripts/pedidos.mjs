/** Pedidos autenticados pelo hook de criação do servidor. Sockets livres nunca executam efeitos. */
const FH='sangue-escuro-fear-and-hunger',PAGE='Recibos e operações FH';
const handlers=new Map(),copy=structuredClone;
const list=c=>c?.contents??Array.from(c?.values?.()??c??[]);
export const escapar=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const content=s=>'<pre>'+escapar(JSON.stringify(s))+'</pre>';
const decode=s=>s.replace(/^\s*<pre[^>]*>/,'').replace(/<\/pre>\s*$/,'').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&amp;','&');
const get=(o,k)=>k.split('.').reduce((v,k)=>v?.[k],o);
const stable=o=>o&&typeof o==='object'?Array.isArray(o)?o.map(stable):Object.fromEntries(Object.keys(o).sort().map(k=>[k,stable(o[k])])):o;
const equal=(a,b)=>JSON.stringify(stable(a??null))===JSON.stringify(stable(b??null));
const active=()=>game.system?.id==='sangue-escuro'&&!!game.modules.get(FH)?.active&&!!game.sangueEscuro?.api?.cenarioEh('fear-and-hunger');
export const mestreAtivo=()=>game.user.isGM&&game.users.activeGM?.id===game.user.id;
function gm(){if(!mestreAtivo())throw Error('Esta operação exige o Mestre ativo.');}
let queue=Promise.resolve();
const serial=fn=>{const next=queue.catch(()=>{}).then(fn);queue=next;return next;};
const fail=error=>{console.error(FH,error);ui.notifications.warn(error.message);};
export function registrarPedido(tipo,prepare,policy){handlers.set(tipo,{prepare,policy});}
export function atorSolicitante(){return game.user.character??globalThis.canvas?.tokens?.controlled?.map(t=>t.actor).find(a=>a?.type==='character'&&a.isOwner)??list(game.actors).find(a=>a.type==='character'&&a.testUserPermission(game.user,3));}
async function database(){
 gm();let id=game.settings.get(FH,'bancoPedidos'),d;
 if(id){d=game.journal.get(id);if(!d)throw Error('O livro privado de pedidos FH foi removido. Restaure-o do backup; recibos não serão reiniciados.');}
 else {d=await JournalEntry.create({name:'Fear & Hunger — Recibos do Mestre',ownership:{default:0,[game.user.id]:3},flags:{[FH]:{pedidos:true}},pages:[{name:PAGE,type:'text',ownership:{default:-1},text:{format:1,content:content({schema:1,requests:{},used:{},pending:null})}}]});gm();await game.settings.set(FH,'bancoPedidos',d.id);}
 if((d.ownership?.default??0)!==0||list(game.users).some(u=>!u.isGM&&(d.ownership?.[u.id]??0)>0))throw Error('O livro de pedidos FH deve permanecer privado aos Mestres.');
 const p=list(d.pages).find(p=>p.name===PAGE);if(!p)throw Error('Página de recibos FH removida. Restaure o backup.');
 if((p.ownership?.default??-1)>0||list(game.users).some(u=>!u.isGM&&(p.ownership?.[u.id]??-1)>0))throw Error('A página de recibos FH deve permanecer privada.');
 return p;
}
export async function lerPedidos(){const p=await database(),s=JSON.parse(decode(p.text.content));if(s.schema!==1||!s.requests||!s.used)throw Error('Formato de recibos FH inválido.');return s;}
async function save(s){
 gm();const p=await database(),before=JSON.parse(decode(p.text.content));gm();await p.update({'text.content':content(s)});
 // Só a resposta visual é espelhada no chat; ela nunca autoriza uma ação ou substitui o recibo privado.
 for(const [id,r]of Object.entries(s.requests)){
  if(before.requests[id]?.status===r.status&&before.requests[id]?.note===r.note)continue;
  const m=game.messages.get(id.split('.').at(-1));if(m?.uuid!==id)continue;
  try{gm();await m.update({['flags.'+FH+'.resposta']:{status:r.status,note:r.note??''}});}catch(e){console.warn(FH,'Resposta visual do pedido não sincronizada:',e.message);}
 }
 Hooks.callAll('fh.pedidosAlterados');
}
async function validate(type,data,user){
 if(!active())throw Error('O cenário Fear & Hunger não está ativo.');
 if(!user?.active)throw Error('Solicitante ausente ou desconectado.');
 const entry=handlers.get(type);if(!entry)throw Error('Pedido FH desconhecido.');
 const policy=entry.policy;if(!policy)throw Error('Pedido sem política de autorização.');
 for(const part of policy.parts)if(!game.settings.get(FH,'parte'+part))throw Error(`A parte ${part} está desativada.`);
 if(policy.gmOnly&&!user.isGM)throw Error('Este ajuste é exclusivo do Mestre.');
 if(!data||Object.getPrototypeOf(data)!==Object.prototype||Object.keys(data).some(k=>!policy.keys.includes(k)))throw Error('Campos do pedido inválidos.');
 const actorKey=policy.actorKey??'actorUuid',uuid=data[actorKey];let actor=null;
 if(uuid!=null){if(typeof uuid!=='string'||uuid.length>300)throw Error('Referência de personagem inválida.');actor=await fromUuid(uuid);if(actor?.documentName!=='Actor'||actor.type!=='character'||!user.isGM&&!actor.testUserPermission(user,3))throw Error('O solicitante não controla o personagem de origem.');}
 else if(!user.isGM)throw Error('Escolha um personagem controlado pelo solicitante.');
 if(policy.validate)await policy.validate(data,{user,actor});
 return {entry,actor};
}
function payload(m){const r=m.flags?.[FH]?.pedido;if(!r||typeof r.tipo!=='string'||JSON.stringify(r).length>5000||Object.keys(r).some(k=>!['tipo','dados'].includes(k)))throw Error('Pedido FH inválido.');return {tipo:r.tipo,dados:copy(r.dados??{})};}
export async function solicitarPedido(tipo,dados={}){
 if(!active())throw Error('O cenário Fear & Hunger não está ativo.');
 const gmUser=game.users.activeGM;if(!gmUser)throw Error('Um Mestre conectado é necessário.');
 const m=await ChatMessage.create({user:game.user.id,whisper:[...new Set([gmUser.id,game.user.id])],content:`<p>Fear & Hunger — pedido: ${escapar(tipo)}. O Mestre acompanha a confirmação neste cartão.</p>`,flags:{[FH]:{pedido:{tipo,dados:copy(dados)}}}});
 // O caminho direto é exclusivo do GM; no jogador só o hook autenticado do servidor chega ao executor.
 if(mestreAtivo())await receberPedido(m,{},game.user.id);
 return m;
}
export async function receberPedido(message,options,userId){
 if(!mestreAtivo()||!active()||!message?.flags?.[FH]?.pedido)return;
 const m=game.messages.get(message.id);if(!m||m.documentName!=='ChatMessage'||m.author?.id!==userId||!userId)return false;
 return serial(async()=>{
  gm();const user=game.users.get(userId),s=await lerPedidos();if(s.requests[m.uuid])return s.requests[m.uuid];
  try{
   const r=payload(m);const {entry}=await validate(r.tipo,r.dados,user);if(s.pending)throw Error('Há um pedido FH interrompido. Confira-o antes de executar outro.');
   s.requests[m.uuid]={id:m.uuid,author:user.id,...r,status:!user.isGM&&entry.policy.approval?'aguardando':'preparando'};
   if(s.requests[m.uuid].status==='aguardando'){await save(s);ui.notifications.info('Pedido de moedas FH aguardando confirmação do Mestre no chat.');return s.requests[m.uuid];}
   return await begin(s,m.uuid);
  }catch(error){
   const current=await lerPedidos();if(current.pending?.id!==m.uuid&&!current.requests[m.uuid]){current.requests[m.uuid]={id:m.uuid,author:userId,status:'recusado',note:String(error.message).slice(0,500)};await save(current);}throw error;
  }
 });
}
async function begin(s,id){
 gm();if(s.pending)throw Error('Confira o pedido FH interrompido antes de continuar.');
 const r=s.requests[id],user=game.users.get(r.author),{entry,actor}=await validate(r.tipo,r.dados,user);
 if(entry.policy.onceField&&s.used[r.dados[entry.policy.onceField]])throw Error('Este cartão já foi utilizado em outro pedido.');
 const plan=await entry.prepare(copy(r.dados),{user,actor,id});
 await validate(r.tipo,r.dados,user);gm();
 if(plan.use&&s.used[plan.use])throw Error('Este cartão já foi utilizado em outro pedido.');
 if(plan.use)s.used[plan.use]=id;
 r.status='aplicando';s.pending={id,plan,phase:'effects'};await save(s);return resume();
}
const marker='flags.'+FH+'.pedidoAplicado';
function checkContext(plan){if(plan.combat){const c=game.combat;if(!c?.started||c.id!==plan.combat.id||c.round!==plan.combat.round||c.turn!==plan.combat.turn)throw Error('O turno mudou durante o pedido. Confira os efeitos antes de encerrar manualmente.');}}
async function actorStep(st,id,apply=true){
 const a=await fromUuid(st.uuid);if(a?.documentName!=='Actor')throw Error('Personagem do pedido indisponível.');
 if(get(a,marker)===id)return true;
 if(!Object.entries(st.before).every(([k,v])=>equal(get(a,k),v)))throw Error('O personagem mudou durante o pedido; confira os dois lados.');
 if(apply){gm();await a.update({...copy(st.after),[marker]:id},{fhPedido:id});}return false;
}
async function resume(){
 gm();let s=await lerPedidos(),pending=s.pending;if(!pending)return;
 const r=s.requests[pending.id],p=pending.plan;
 if(pending.phase==='effects'){
  let effectsComplete=true;
  for(const st of p.steps){const done=st.kind==='coins'?game.settings.get(FH,'moedas')===st.after:get(await fromUuid(st.uuid),marker)===pending.id;if(!done)effectsComplete=false;}
  if(!effectsComplete){
   if(!active())throw Error('Reative Fear & Hunger para retomar o pedido pendente.');
   for(const part of handlers.get(r.tipo).policy.parts)if(!game.settings.get(FH,'parte'+part))throw Error(`A parte ${part} está desativada. Reative-a ou confira manualmente.`);
  }
  // Se todos os débitos/créditos de atores já foram aplicados, somente o registro/chat é retomado.
  const actors=p.steps.filter(st=>st.kind==='actor');let actorsComplete=actors.length>0;
  for(const st of actors){const a=await fromUuid(st.uuid);if(get(a,marker)!==pending.id)actorsComplete=false;}
  if(!actorsComplete)checkContext(p);
  for(const st of p.steps){
   gm();if(st.kind==='actor')await actorStep(st,pending.id);
   else if(st.kind==='coins'){
    const value=game.settings.get(FH,'moedas');if(value===st.after)continue;
    if(value!==st.before)throw Error('A reserva mudou durante o pedido. Confira antes de retomar.');
    await game.settings.set(FH,'moedas',st.after);
   }else throw Error('Efeito FH desconhecido.');
  }
  s=await lerPedidos();s.pending.phase='chat';await save(s);pending=s.pending;
 }
 for(let index=0;index<p.events.length;index++){
  gm();const old=list(game.messages).find(m=>m.author?.isGM&&m.flags?.[FH]?.recibo===pending.id&&m.flags?.[FH]?.evento===index);
  if(old)continue;
  const ev=p.events[index],data={...copy(ev.data),flags:{...ev.data.flags,[FH]:{...ev.data.flags?.[FH],recibo:pending.id,evento:index}}};
  if(ev.roll)await Roll.fromJSON(JSON.stringify(ev.roll)).toMessage(data);else await ChatMessage.create(data);
 }
 s=await lerPedidos();s.requests[pending.id].status='concluido';s.pending=null;await save(s);return s.requests[pending.id];
}
export async function decidirPedido(id,decision){return serial(async()=>{
 gm();const s=await lerPedidos(),r=s.requests[id];if(!r)throw Error('Pedido não encontrado.');
 if(decision==='retomar'){if(s.pending?.id!==id)throw Error('Pedido sem operação pendente.');return resume();}
 if(decision==='cancelar'){
  if(s.pending?.id!==id)throw Error('Pedido sem operação pendente.');
  for(const st of s.pending.plan.steps){
   if(st.kind==='actor'){const a=await fromUuid(st.uuid);if(get(a,marker)===id)throw Error('Já há efeito aplicado; retome ou confira manualmente.');await actorStep(st,id,false);}
   else if(game.settings.get(FH,'moedas')!==st.before)throw Error('A reserva já mudou; retome ou confira manualmente.');
  }
  if(s.pending.plan.use)delete s.used[s.pending.plan.use];s.pending=null;r.status='cancelado';await save(s);return r;
 }
 if(decision==='manual'){
  if(s.pending?.id!==id)throw Error('Pedido sem operação pendente.');r.status='conferido-manualmente';s.pending=null;await save(s);return r;
 }
 if(r.status!=='aguardando')return r;
 if(decision==='recusar'){r.status='recusado';await save(s);return r;}
 if(decision!=='aprovar')throw Error('Decisão inválida.');return begin(s,id);
 });}
export function instalarPedidos(){
 Hooks.on('createChatMessage',(m,o,u)=>{void receberPedido(m,o,u).catch(fail);});
 Hooks.on('renderChatMessageHTML',(m,html)=>{
  if(!m.flags?.[FH]?.pedido)return;
  if(!mestreAtivo()){
   const root=html?.querySelectorAll?html:html?.[0],response=m.flags[FH].resposta;
   if(root&&response&&!root.querySelector('.fh-confirmacao')){const p=document.createElement('p');p.className='fh-confirmacao';p.textContent='Pedido FH: '+response.status+(response.note?' · '+response.note:'');root.append(p);}return;
  }
  void (async()=>{
   const s=await lerPedidos(),r=s.requests[m.uuid];if(!r)return;
   const root=html?.querySelectorAll?html:html?.[0];if(!root||root.querySelector('.fh-confirmacao'))return;
   const box=document.createElement('div');box.className='fh-confirmacao';const label=document.createElement('p');label.textContent='Pedido FH: '+r.status+(r.note?' · '+r.note:'');box.append(label);
   const detail=document.createElement('p'),sourceUuid=r.dados?.actorUuid??r.dados?.de,source=sourceUuid?await fromUuid(sourceUuid):null;
   if(r.tipo==='gastarMoeda'){const card=await fromUuid(r.dados.messageUuid);detail.textContent=`Solicitante: ${game.users.get(r.author)?.name??r.author} · Personagem: ${source?.name??'Mestre'} · Rito: ${card?.flags?.[FH]?.rito?.nome??'sem nome'}. Confirme o gasto da reserva coletiva.`;}
   else if(r.tipo==='obterMoeda')detail.textContent=`Personagem: ${source?.name??'Mestre'}. Confirme que a criatura derrotada ainda oferece sua única oportunidade de obter moeda.`;
   else if(r.tipo==='moedaAchado')detail.textContent=`Personagem: ${source?.name??'Mestre'}. Confirme o achado válido da rolagem compartilhada antes de creditar a moeda.`;
   else detail.textContent=`Solicitante: ${game.users.get(r.author)?.name??r.author} · ${r.tipo}`;
   box.append(detail);
   const actions=s.pending?.id===r.id?[['retomar','Retomar conferência'],['cancelar','Cancelar se não aplicado'],['manual','Encerrar após ajuste manual']]:r.status==='aguardando'?[['aprovar','Aprovar'],['recusar','Recusar']]:[];
   for(const [value,text] of actions){const b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',async()=>{b.disabled=true;try{if(value==='manual'&&!await foundry.applications.api.DialogV2.confirm({window:{title:'Conferência manual FH'},content:'<p>Confira e ajuste os dois lados no mundo. Encerrar marca o pedido como conferido, sem aplicar ou desfazer efeitos. Confirma que a revisão manual terminou?</p>'}))return;await decidirPedido(r.id,value);ui.chat?.render?.();}catch(e){fail(e);}finally{b.disabled=false;}});box.append(b);}
   root.append(box);
  })().catch(fail);
 });
 Hooks.on('fh.pedidosAlterados',()=>ui.chat?.render?.());
 Hooks.on('updateUser',()=>ui.chat?.render?.());
 Hooks.on('updateJournalEntryPage',p=>{if(game.user.isGM&&p.parent?.id===game.settings.get(FH,'bancoPedidos'))ui.chat?.render?.();});
}
/** Mantido só para rejeitar explicitamente o protocolo antigo, sem efeitos. */
export async function rejeitarSocket(){return false;}

/** Acesso de recuperação também existe nas configurações, caso o cartão do pedido tenha sido apagado. */
export async function abrirConferencia(){
 gm();const s=await lerPedidos(),rows=Object.values(s.requests).filter(r=>r.status==='aguardando'||s.pending?.id===r.id);
 if(!rows.length){ui.notifications.info('Nenhum pedido FH aguardando decisão ou conferência.');return;}
 const choice=await foundry.applications.api.DialogV2.wait({window:{title:'Fear & Hunger — pedidos do Mestre'},content:'<p>Confirme a origem de moedas ou confira os efeitos de um pedido interrompido.</p>',rejectClose:false,buttons:rows.map((r,i)=>({action:'pedido'+i,label:r.tipo+' · '+r.status+' · '+(game.users.get(r.author)?.name??r.author)}))});
 const r=rows.find((_,i)=>choice==='pedido'+i);if(!r)return;
 const pending=s.pending?.id===r.id,actions=pending?[['retomar','Retomar'],['cancelar','Cancelar se não aplicado'],['manual','Encerrar após ajuste manual']]:[['aprovar','Aprovar'],['recusar','Recusar']];
 const sourceUuid=r.dados?.actorUuid??r.dados?.de,source=sourceUuid?await fromUuid(sourceUuid):null,card=r.dados?.messageUuid?await fromUuid(r.dados.messageUuid):null;
 const decision=await foundry.applications.api.DialogV2.wait({window:{title:'Conferir pedido FH'},content:`<p>${escapar(r.tipo)} · ${escapar(source?.name??'Mestre')} · ${escapar(card?.flags?.[FH]?.rito?.nome??'')}</p><p>Confirme os requisitos da cena. Para obter moeda, a criatura derrotada deve conservar sua única oportunidade. Achados exigem a rolagem compartilhada correspondente.</p>`,rejectClose:false,buttons:actions.map(([action,label])=>({action,label}))});
 if(!decision)return;
 if(decision==='manual'&&!await foundry.applications.api.DialogV2.confirm({window:{title:'Conferência manual FH'},content:'<p>Você conferiu e ajustou os dois lados no mundo? Encerrar não aplica nem desfaz efeitos.</p>'}))return;
 await decidirPedido(r.id,decision);
}
