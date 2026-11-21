import { CATALOGO } from './icones-catalogo.mjs';
const ID='sangue-escuro-fear-and-hunger', CENARIO='fear-and-hunger', PREFIXOS=["fh-itens"];
const normal=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const chave=(tipo,nome)=>`${tipo}:${normal(nome)}`;
const tabela=new Map(CATALOGO.map(i=>[chave(i.type,i.name),i]));
const genericos=new Set(['icons/svg/item-bag.svg','icons/svg/item-bag.png','icons/svg/sword.svg','icons/svg/target.svg','icons/svg/shield.svg','icons/svg/upgrade.svg','icons/svg/book.svg','icons/svg/explosion.svg','icons/svg/mystery-man.svg']);
const lista=c=>c?.contents??Array.from(c?.values?.()??[]);
function origem(item){
 const value=item.flags?.['sangue-escuro']?.origemCompendio;
 if(typeof value!=='string')return null;
 const prefixo=PREFIXOS.find(p=>value.startsWith(p+':'));if(!prefixo)return null;
 const id=value.slice(prefixo.length+1).replace(/:\d+$/,'');const corte=id.indexOf(':');
 return tabela.get(chave(id.slice(0,corte),id.slice(corte+1)))??null;
}
export function imagemPredefinida(item,{criacao=false}={}){
 if(item.flags?.['sangue-escuro']?.iconeManual===true)return null;
 const vinculado=Object.hasOwn(item.flags??{},ID), original=origem(item);
 let registro=original??tabela.get(chave(item.type,item.name));
 if(!registro)return null;
 // Itens legados sem origem são reconhecidos somente no cenário ativo, sem tomar itens de outra expansão.
 const outraExpansao=Object.keys(item.flags??{}).some(k=>k.startsWith('sangue-escuro-')&&k!==ID);
 if(!vinculado&&!original&&(outraExpansao||!globalThis.game?.sangueEscuro?.api?.cenarioEh(CENARIO)))return null;
 if(item.img===registro.img)return null;
 if(item.img&&!genericos.has(item.img)&&!registro.anteriores.includes(item.img))return null;
 return registro.img;
}
export function registrarIconesItens(){
 game.settings.register(ID,'iconesItensVersao',{scope:'world',config:false,type:Number,default:0});
 Hooks.on('preCreateItem',(item,data)=>{const img=imagemPredefinida(data,{criacao:true});if(img)item.updateSource({img});});
 // Mantém a associação da expansão caso uma migração antiga do núcleo atualize a mesma imagem.
 Hooks.on('preUpdateItem',(item,changes)=>{
  if(!Object.hasOwn(changes,'img')||changes['flags.sangue-escuro.iconeManual']===true||changes.flags?.['sangue-escuro']?.iconeManual===true)return;
  const img=imagemPredefinida({name:item.name,type:item.type,flags:item.flags,img:changes.img});if(img)changes.img=img;
 });
}
export async function corrigirIconesItens(){
 if(!game.sangueEscuro?.api?.cenarioEh(CENARIO))return 0;
 if(!game.user.isGM||game.users.activeGM&&!game.users.activeGM.isSelf||game.settings.get(ID,'iconesItensVersao')>=1)return 0;
 let n=0;
 try {
  const docs=[...lista(game.items),...lista(game.actors).flatMap(a=>lista(a.items)),...lista(game.scenes).flatMap(s=>lista(s.tokens).filter(t=>!t.actorLink&&t.actor).flatMap(t=>lista(t.actor.items)))];
  for(const item of docs){const img=imagemPredefinida(item);if(img&&item.isOwner!==false){await item.update({img});n++;}}
  for(const pack of game.packs.values()){
   // Compêndios da expansão criados no mundo e cópias manuais com a origem identificada.
   if(!pack.collection?.startsWith('world.')||(pack.documentName??pack.metadata?.type)!=='Item')continue;
   const index=await pack.getIndex({fields:['img','type',`flags.${ID}`,'flags.sangue-escuro']});
   const updates=lista(index).map(i=>{const img=imagemPredefinida(i);return img?{_id:i._id??i.id,img}:null;}).filter(Boolean);
   if(!updates.length)continue;
   const bloqueado=pack.locked===true;
   try{if(bloqueado)await pack.configure({locked:false});await Item.updateDocuments(updates,{pack:pack.collection});n+=updates.length;}
   finally{if(bloqueado)await pack.configure({locked:true});}
  }
  await game.settings.set(ID,'iconesItensVersao',1);
  if(n)ui.notifications.info(`Fear & Hunger: imagens predefinidas aplicadas a ${n} itens. Imagens personalizadas preservadas.`);
  return n;
 }catch(err){console.error(`${ID} | Atualização de imagens`,err);ui.notifications.warn('Fear & Hunger: algumas imagens não foram atualizadas. Uma nova tentativa ocorrerá ao reabrir o mundo. Veja F12.');return n;}
}
