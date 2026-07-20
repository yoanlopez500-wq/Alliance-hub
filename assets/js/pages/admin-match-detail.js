window.requireAdmin();
var urlParams=new URLSearchParams(window.location.search);
var matchId=urlParams.get('id');
var action=urlParams.get('action');
var currentMatch=null;
var csvData=null;
var cachedRegistrations=[];
var currentEditRegId=null;
var currentAdminRole=null;
var currentEditResultId=null;

async function loadMatch(){if(action==='new'){showCreateForm();return;}if(!matchId){document.getElementById('match-header').innerHTML='<div class="text-center py-8 text-red-400">No se especifico ID</div>';return;}try{var{data:m,error}=await window.supabase.from('matches').select('*').eq('id',matchId).single();if(error||!m){document.getElementById('match-header').innerHTML='<div class="text-center py-8 text-red-400">Partida no encontrada</div>';return;}currentMatch=m;var alliance=null;if(m.alliance_id){var{data:a}=await window.supabase.from('alliances').select('name,tag').eq('id',m.alliance_id).single();alliance=a;}var alLabel=alliance?' ['+alliance.tag+']':'';var shareUrl=window.location.origin+'/aliance-hub/game.html?id='+matchId;document.getElementById('match-header').innerHTML='<div class="rounded-xl p-5 bg-slate-900 border border-indigo-900"><div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3"><div><h1 class="text-2xl font-bold text-slate-100">&#127918; '+(m.name||'Partida')+alLabel+'</h1><div class="flex gap-2 mt-1 flex-wrap">'+window.getStatusBadge(m.status)+' '+window.getTypeBadge(m.match_type||m.type)+' '+(m.csv_imported?'<span class="px-2 py-0.5 rounded text-xs font-bold bg-green-500/15 text-green-500">&#10003; CSV</span>':'')+'</div></div><a href="matches.html" class="px-3 py-1.5 rounded-lg font-bold text-sm self-start bg-indigo-900 text-slate-100">&larr; Volver</a></div><div class="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm"><div class="rounded-lg p-3 bg-slate-950"><p class="text-xs text-slate-400">ID Juego</p><p class="font-bold">'+(m.game_id||'-')+'</p></div><div class="rounded-lg p-3 bg-slate-950"><p class="text-xs text-slate-400">Max</p><p class="font-bold">'+(m.max_players||'-')+'</p></div><div class="rounded-lg p-3 bg-slate-950"><p class="text-xs text-slate-400">Creada</p><p class="font-bold">'+window.formatDate(m.created_at)+'</p></div><div class="rounded-lg p-3 bg-slate-950"><p class="text-xs text-slate-400">Alianza</p><p class="font-bold">'+(alliance?alliance.name:'Ninguna')+'</p></div><div class="rounded-lg p-3 bg-slate-950"><p class="text-xs text-slate-400">Password</p><p class="font-bold">'+(m.password||'-')+'</p></div></div>'+(m.description?'<div class="mt-3 p-3 rounded-lg text-sm bg-slate-950 text-slate-400">'+m.description+'</div>':'')+'</div>';document.getElementById('share-section').classList.remove('hidden');document.getElementById('share-link').value=shareUrl;document.getElementById('admin-actions-section').classList.remove('hidden');await Promise.all([loadRegistrations(),loadResults()]);initAdminRole();}catch(e){console.error(e);document.getElementById('match-header').innerHTML='<div class="text-center py-8 text-red-400">Error: '+e.message+'</div>';}}

async function initAdminRole(){
    try{
        var admin=await getAdminRole();
        if(admin) currentAdminRole=admin.role;
    }catch(e){}
}
function isSuperadmin(){return currentAdminRole==='superadmin';}
function isAdmin(){return currentAdminRole==='superadmin'||currentAdminRole==='event_admin'||currentAdminRole==='moderator';}
function canEditResults(){return isAdmin();}

function showCreateForm(){document.getElementById('match-header').classList.add('hidden');document.getElementById('admin-actions-section').classList.add('hidden');document.getElementById('share-section').classList.add('hidden');document.getElementById('registrations-section').classList.add('hidden');document.getElementById('results-section').classList.add('hidden');document.getElementById('create-match-section').classList.remove('hidden');loadAllianceSelect('cm-alliance',null);}

async function loadAllianceSelect(selectId,selectedId){try{var{data:alliances}=await window.supabase.from('alliances').select('id,name').order('name');var html='<option value="">-- Sin alianza --</option>';(alliances||[]).forEach(function(a){html+='<option value="'+a.id+'"'+(a.id===selectedId?' selected':'')+'>'+a.name+'</option>';});document.getElementById(selectId).innerHTML=html;}catch(e){}}

document.getElementById('create-match-form').addEventListener('submit',async function(e){e.preventDefault();var name=document.getElementById('cm-name').value.trim();var gameId=document.getElementById('cm-game-id').value.trim()||null;var password=document.getElementById('cm-password').value.trim()||null;var allianceId=document.getElementById('cm-alliance').value||null;var type=document.getElementById('cm-type').value;var maxPlayers=parseInt(document.getElementById('cm-max').value)||null;var desc=document.getElementById('cm-desc').value.trim()||null;if(!name){window.showToast('Nombre obligatorio','warning');return;}try{var{data:{session}}=await window.supabase.auth.getSession();var{data,error}=await window.supabase.from('matches').insert({name,game_id:gameId,password:password,alliance_id:allianceId,match_type:type,max_players:maxPlayers,description:desc,status:'draft',created_by:session.user.id}).select().single();if(error)throw error;window.showToast('Partida creada','success');setTimeout(function(){window.location.href='match-detail.html?id='+data.id;},800);}catch(e){window.showToast('Error: '+e.message,'error');}});

async function loadRegistrations(){try{var{data:regs,error}=await window.supabase.from('match_registrations').select('*').eq('match_id',matchId).order('registered_at',{ascending:false});if(error)throw error;var r=regs||[];cachedRegistrations=r;document.getElementById('reg-count').textContent=r.length;if(r.length===0){document.getElementById('registrations-list').innerHTML='<div class="text-center py-6 text-sm text-slate-400">Sin registrados</div>';return;}var playerIds=r.map(function(x){return x.player_id;}).filter(function(v,i,a){return a.indexOf(v)===i;});var{data:players}=await window.supabase.from('players').select('id,current_username').in('id',playerIds);var pm={};(players||[]).forEach(function(p){pm[p.id]=p;});var{data:matchResults}=await window.supabase.from('match_results').select('player_id,kills,deaths').eq('match_id',matchId);var rm={};(matchResults||[]).forEach(function(mr){rm[mr.player_id]={kills:mr.kills||0,deaths:mr.deaths||0};});var html='<table class="w-full text-sm min-w-full"><thead><tr class="bg-slate-950"><th class="text-left p-2 text-slate-400 text-[11px]">ID</th><th class="text-left p-2 text-slate-400">Jugador</th><th class="text-right p-2 text-slate-400">Kills</th><th class="text-right p-2 text-slate-400">Deaths</th><th class="text-left p-2 text-slate-400">Nacion</th><th class="text-left p-2 text-slate-400">Estado</th><th class="text-center p-2 text-slate-400">Acciones</th></tr></thead><tbody>'+r.map(function(x){var p=pm[x.player_id]||{};var mr=rm[x.player_id]||{kills:0,deaths:0};return'<tr class="border-b border-indigo-900"><td class="p-2 font-mono text-xs text-slate-500">'+x.player_id+'</td><td class="p-2 font-medium">'+(p.current_username||'Jugador '+x.player_id)+'</td><td class="p-2 text-right">'+mr.kills+'</td><td class="p-2 text-right">'+mr.deaths+'</td><td class="p-2 text-sm text-slate-400">'+(x.nation||'-')+'</td><td class="p-2">'+window.getStatusBadge(x.status)+'</td><td class="p-2 text-center"><button onclick="editRegistration(\''+x.id+'\')" class="text-xs px-1 py-0.5 rounded mr-1 bg-blue-500/15 text-blue-500" title="Editar">&#9998;</button><button onclick="deleteRegistration(\''+x.id+'\')" class="text-xs px-1 py-0.5 rounded mr-1 bg-red-500/15 text-red-400" title="Eliminar">&#128465;</button><button onclick="strikeFromRegistration('+x.player_id+')" class="text-xs px-1 py-0.5 rounded bg-amber-500/15 text-amber-400" title="Sancionar">&#9889;</button></td></tr>';}).join('')+'</tbody></table>';document.getElementById('registrations-list').innerHTML=html;}catch(e){document.getElementById('registrations-list').innerHTML='<div class="text-center py-4 text-red-400 text-sm">Error: '+e.message+'</div>';}}

async function editRegistration(registrationId){try{var reg=cachedRegistrations.find(function(x){return x.id===registrationId;});if(!reg){var{data,error}=await window.supabase.from('match_registrations').select('*,players:player_id(current_username)').eq('id',registrationId).single();if(error)throw error;reg=data;}var playerName=reg.players&&reg.players.current_username?reg.players.current_username:(reg.player_id?'Jugador '+reg.player_id:'');currentEditRegId=registrationId;document.getElementById('er-player-id').value=reg.player_id||'';document.getElementById('er-username').value=playerName;document.getElementById('er-nation').value=reg.nation||'';document.getElementById('er-status').value=reg.status||'pending';document.getElementById('er-notes').value=reg.notes||'';document.getElementById('edit-reg-modal').classList.add('active');}catch(e){window.showToast('Error: '+e.message,'error');}}

function closeEditRegModal(){document.getElementById('edit-reg-modal').classList.remove('active');currentEditRegId=null;}

async function saveEditRegistration(){if(!currentEditRegId)return;try{var nation=document.getElementById('er-nation').value.trim()||null;var status=document.getElementById('er-status').value;var notes=document.getElementById('er-notes').value.trim()||null;var username=document.getElementById('er-username').value.trim()||null;var{error}=await window.supabase.from('match_registrations').update({nation:nation,status:status,notes:notes}).eq('id',currentEditRegId);if(error)throw error;var reg=cachedRegistrations.find(function(x){return x.id===currentEditRegId;});if(reg&&username&&username!==reg.player_id){await window.supabase.from('players').update({current_username:username}).eq('id',reg.player_id);}window.showToast('Registro actualizado','success');closeEditRegModal();loadRegistrations();}catch(e){window.showToast('Error: '+e.message,'error');}}

async function deleteRegistration(registrationId){if(!confirm('Eliminar este registro de la partida? El jugador podra volver a registrarse.'))return;try{var{error}=await window.supabase.from('match_registrations').delete().eq('id',registrationId);if(error)throw error;window.showToast('Registro eliminado','success');loadRegistrations();}catch(e){window.showToast('Error: '+e.message,'error');}}

function strikeFromRegistration(playerId){if(!confirm('Redirigir al panel de strikes para sancionar al jugador '+playerId+'?'))return;window.open('strikes.html?prefill_player='+playerId+(matchId?'&prefill_match='+matchId:''),'_blank');}

async function loadPlayersForResultDropdown(){try{var select=document.getElementById('mr-player-select');if(!cachedRegistrations||cachedRegistrations.length===0){select.innerHTML='<option value="">-- No hay registrados --</option>';return;}var playerIds=cachedRegistrations.map(function(x){return x.player_id;}).filter(function(v,i,a){return a.indexOf(v)===i;});var{data:players}=await window.supabase.from('players').select('id,current_username').in('id',playerIds);var pm={};(players||[]).forEach(function(p){pm[p.id]=p;});var html='<option value="">-- Seleccionar de registrados --</option>';cachedRegistrations.forEach(function(r){var name=pm[r.player_id]?pm[r.player_id].current_username:'Jugador '+r.player_id;html+='<option value="'+r.player_id+'">'+name+' (ID: '+r.player_id+')</option>';});select.innerHTML=html;}catch(e){console.error('[ResultDropdown]',e);}}

function openManualModal(){document.getElementById('manual-modal').classList.add('active');document.getElementById('mr-player-id').value='';document.getElementById('mr-player-id-override').value='';document.getElementById('mr-kills').value='';document.getElementById('mr-deaths').value='';document.getElementById('mr-nation').value='';loadPlayersForResultDropdown();}
function closeManualModal(){document.getElementById('manual-modal').classList.remove('active');}

document.getElementById('manual-form').addEventListener('submit',async function(e){e.preventDefault();var playerId=parseInt(document.getElementById('mr-player-id').value)||parseInt(document.getElementById('mr-player-id-override').value);var kills=parseInt(document.getElementById('mr-kills').value)||0;var deaths=parseInt(document.getElementById('mr-deaths').value)||0;var nation=document.getElementById('mr-nation').value||null;if(!playerId){window.showToast('Selecciona o escribe un ID de jugador','warning');return;}try{var kd=deaths>0?(kills/deaths):kills;await window.supabase.from('match_results').upsert({match_id:matchId,player_id:playerId,nation:nation,kills:kills,deaths:deaths,kd_ratio:parseFloat(kd.toFixed(2))},{onConflict:'match_id,player_id'});window.showToast('Guardado','success');closeManualModal();loadResults();}catch(e){window.showToast('Error: '+e.message,'error');}});

async function loadResults(){try{var{data:results,error}=await window.supabase.from('match_results').select('*').eq('match_id',matchId).order('imported_at',{ascending:false});if(error)throw error;var res=results||[];if(res.length===0){document.getElementById('results-list').innerHTML='<div class="text-center py-6 text-sm text-slate-400">Sin resultados</div>';return;}var playerIds=res.map(function(r){return r.player_id;}).filter(function(v,i,a){return a.indexOf(v)===i;});var{data:players}=await window.supabase.from('players').select('id,current_username').in('id',playerIds);var pm={};(players||[]).forEach(function(p){pm[p.id]=p;});var{data:regs}=await window.supabase.from('match_registrations').select('player_id').eq('match_id',matchId);var regIds={};(regs||[]).forEach(function(r){regIds[r.player_id]=true;});var showActions=canEditResults();var html='<table class="w-full text-sm min-w-full"><thead><tr class="bg-slate-950"><th class="text-left p-3">Jugador</th><th class="text-right p-3">Bajas</th><th class="text-right p-3">Muertes</th><th class="text-right p-3">KD</th><th class="text-center p-3">Valido</th>'+(showActions?'<th class="text-center p-3">Acciones</th>':'')+'</tr></thead><tbody>'+res.map(function(r){var p=pm[r.player_id]||{};var isValid=!!regIds[r.player_id];var validBadge=isValid?'<span class="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-500">Si</span>':'<span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-400" title="No registrado en la partida: no cuenta para ranking">No</span>';var actionButtons=showActions?'<td class="p-2 text-center"><button onclick="editResult(\''+r.id+'\')" class="text-xs px-1 py-0.5 rounded mr-1 bg-blue-500/15 text-blue-500" title="Editar">&#9998;</button><button onclick="deleteResult(\''+r.id+'\','+r.player_id+')" class="text-xs px-1 py-0.5 rounded bg-red-500/15 text-red-400" title="Eliminar">&#128465;</button></td>':'';return'<tr class="border-b border-indigo-900"><td class="p-3 font-medium">'+(p.current_username||'Jugador '+r.player_id)+'</td><td class="p-3 text-right text-green-500">'+(r.kills||0)+'</td><td class="p-3 text-right text-red-400">'+(r.deaths||0)+'</td><td class="p-3 text-right font-bold">'+(r.kd_ratio||0)+'</td><td class="p-3 text-center">'+validBadge+'</td>'+actionButtons+'</tr>';}).join('')+'</tbody></table>';document.getElementById('results-list').innerHTML=html;}catch(e){document.getElementById('results-list').innerHTML='<div class="text-center py-4 text-red-400 text-sm">Error: '+e.message+'</div>';}}

async function editResult(resultId){
    if(!canEditResults()){window.showToast('Solo admins pueden editar resultados','error');return;}
    try{
        var{data:r,error}=await window.supabase.from('match_results').select('*').eq('id',resultId).single();
        if(error)throw error;
        if(!r){window.showToast('Resultado no encontrado','error');return;}
        currentEditResultId=resultId;
        var{data:player}=await window.supabase.from('players').select('current_username').eq('id',r.player_id).maybeSingle();
        document.getElementById('er-result-player-id').value=r.player_id||'';
        document.getElementById('er-result-username').value=player?player.current_username:'Jugador '+r.player_id;
        document.getElementById('er-result-kills').value=r.kills||0;
        document.getElementById('er-result-deaths').value=r.deaths||0;
        document.getElementById('er-result-nation').value=r.nation||'';
        document.getElementById('edit-result-modal').classList.add('active');
    }catch(e){window.showToast('Error: '+e.message,'error');}
}

function closeEditResultModal(){
    document.getElementById('edit-result-modal').classList.remove('active');
    currentEditResultId=null;
}

async function saveEditResult(){
    if(!currentEditResultId)return;
    if(!canEditResults()){window.showToast('Solo admins pueden editar resultados','error');return;}
    try{
        var kills=parseInt(document.getElementById('er-result-kills').value)||0;
        var deaths=parseInt(document.getElementById('er-result-deaths').value)||0;
        var nation=document.getElementById('er-result-nation').value||null;
        var kd=deaths>0?(kills/deaths):kills;
        var{error}=await window.supabase.from('match_results').update({kills:kills,deaths:deaths,nation:nation,kd_ratio:parseFloat(kd.toFixed(2))}).eq('id',currentEditResultId);
        if(error)throw error;
        window.showToast('Resultado actualizado','success');
        closeEditResultModal();
        loadResults();
    }catch(e){window.showToast('Error: '+e.message,'error');}
}

async function deleteResult(resultId,playerId){
    if(!canEditResults()){window.showToast('Solo admins pueden eliminar resultados','error');return;}
    if(!confirm('Eliminar el resultado del jugador '+playerId+'?'))return;
    try{
        var{error}=await window.supabase.from('match_results').delete().eq('id',resultId);
        if(error)throw error;
        window.showToast('Resultado eliminado','success');
        loadResults();
    }catch(e){window.showToast('Error: '+e.message,'error');}
}

async function updateStatus(newStatus){if(!confirm('Cambiar a '+newStatus+'?'))return;try{var{error}=await window.supabase.from('matches').update({status:newStatus}).eq('id',matchId);if(error)throw error;window.showToast('Estado actualizado','success');loadMatch();}catch(e){window.showToast('Error: '+e.message,'error');}}

function openCSVModal(){document.getElementById('csv-modal').classList.add('active');document.getElementById('csv-preview-section').classList.add('hidden');}
function closeCSVModal(){document.getElementById('csv-modal').classList.remove('active');}
function handleDrop(e){e.preventDefault();var f=e.dataTransfer.files[0];if(f)handleFile(f);}
function handleFile(f){if(!f||!f.name.endsWith('.csv')){window.showToast('Solo CSV','error');return;}var r=new FileReader();r.onload=function(e){parseCSV(e.target.result);};r.readAsText(f);}
function parseCSV(text){var lines=text.split('\n').filter(function(l){return l.trim();});var preview=document.getElementById('csv-preview');preview.classList.remove('hidden');var html='<table class="w-full text-sm"><thead><tr class="bg-slate-950"><th class="p-2">Player ID</th><th class="p-2 text-right">Kills</th><th class="p-2 text-right">Deaths</th></tr></thead><tbody>';csvData=[];for(var i=1;i<lines.length;i++){var c=lines[i].split(',');if(c.length>=3){var pid=parseInt(c[0].trim());var kills=parseInt(c[1].trim())||0;var deaths=parseInt(c[2].trim())||0;if(pid){csvData.push({player_id:pid,kills:kills,deaths:deaths});html+='<tr class="border-b border-indigo-900"><td class="p-2">'+pid+'</td><td class="p-2 text-right text-green-500">'+kills+'</td><td class="p-2 text-right text-red-400">'+deaths+'</td></tr>';}}}html+='</tbody></table>';document.getElementById('csv-preview').innerHTML=html;}
async function importCSVResults(){if(!matchId||!csvData||csvData.length===0)return;try{for(var i=0;i<csvData.length;i++){var r=csvData[i];var kd=r.deaths>0?(r.kills/r.deaths):r.kills;await window.supabase.from('match_results').upsert({match_id:matchId,player_id:r.player_id,kills:r.kills,deaths:r.deaths,kd_ratio:parseFloat(kd.toFixed(2))},{onConflict:'match_id,player_id'});}await window.supabase.from('matches').update({csv_imported:true}).eq('id',matchId);window.showToast(csvData.length+' resultados importados','success');document.getElementById('csv-preview').classList.add('hidden');loadResults();loadMatch();}catch(e){window.showToast('Error: '+e.message,'error');}}
function handleCSVUpload(input){var f=input.files[0];if(!f)return;var r=new FileReader();r.onload=function(e){parseCSV(e.target.result);};r.readAsText(f);}
async function confirmCSVImport(){if(!csvData||!matchId)return;try{for(var i=0;i<csvData.length;i++){var r=csvData[i];var kd=r.deaths>0?(r.kills/r.deaths):r.kills;await window.supabase.from('match_results').upsert({match_id:matchId,player_id:r.player_id,kills:r.kills,deaths:r.deaths,kd_ratio:parseFloat(kd.toFixed(2))},{onConflict:'match_id,player_id'});}await window.supabase.from('matches').update({csv_imported:true}).eq('id',matchId);window.showToast('CSV importado: '+csvData.length+' jugadores','success');closeCSVModal();loadResults();loadMatch();}catch(e){window.showToast('Error: '+e.message,'error');}}
function openEditModal(){if(!currentMatch)return;document.getElementById('em-name').value=currentMatch.name||'';document.getElementById('em-game-id').value=currentMatch.game_id||'';document.getElementById('em-password').value=currentMatch.password||'';document.getElementById('em-type').value=currentMatch.match_type||currentMatch.type||'internal';document.getElementById('em-max').value=currentMatch.max_players||'';document.getElementById('em-desc').value=currentMatch.description||'';loadAllianceSelect('em-alliance',currentMatch.alliance_id);document.getElementById('edit-modal').classList.add('active');}
function closeEditModal(){document.getElementById('edit-modal').classList.remove('active');}
document.getElementById('edit-form').addEventListener('submit',async function(e){e.preventDefault();try{var{error}=await window.supabase.from('matches').update({name:document.getElementById('em-name').value,game_id:document.getElementById('em-game-id').value||null,password:document.getElementById('em-password').value||null,alliance_id:document.getElementById('em-alliance').value||null,match_type:document.getElementById('em-type').value,max_players:parseInt(document.getElementById('em-max').value)||null,description:document.getElementById('em-desc').value||null}).eq('id',matchId);if(error)throw error;window.showToast('Actualizada','success');closeEditModal();loadMatch();}catch(e){window.showToast('Error: '+e.message,'error');}});
async function deleteMatch(){if(!confirm('Eliminar permanentemente?'))return;try{await window.supabase.from('match_results').delete().eq('match_id',matchId);await window.supabase.from('match_registrations').delete().eq('match_id',matchId);await window.supabase.from('match_winners').delete().eq('match_id',matchId);var{error}=await window.supabase.from('matches').delete().eq('id',matchId);if(error)throw error;window.showToast('Eliminada','success');setTimeout(function(){window.location.href='matches.html';},800);}catch(e){window.showToast('Error: '+e.message,'error');}}
async function openWinnersModal(){try{var{data:results}=await window.supabase.from('match_results').select('*').eq('match_id',matchId).order('kills',{ascending:false});var{data:regs}=await window.supabase.from('match_registrations').select('player_id').eq('match_id',matchId);var regIds={};(regs||[]).forEach(function(r){regIds[r.player_id]=true;});var list=document.getElementById('winners-list');if(!results||results.length===0){list.innerHTML='<p class="text-sm text-center text-slate-400">Sin resultados</p>';}else{var validResults=results.filter(function(r){return regIds[r.player_id];});var playerIds=validResults.map(function(r){return r.player_id;}).filter(function(v,i,a){return a.indexOf(v)===i;});var{data:players}=await window.supabase.from('players').select('id,current_username').in('id',playerIds);var pm={};(players||[]).forEach(function(p){pm[p.id]=p;});list.innerHTML=validResults.map(function(r,i){var p=pm[r.player_id]||{};return'<div class="flex items-center gap-3 p-3 rounded-lg bg-slate-950 border border-indigo-900"><span class="text-lg font-bold w-6 text-amber-400">#'+(i+1)+'</span><div class="flex-1"><p class="font-medium text-sm text-slate-100">'+(p.current_username||'Jugador '+r.player_id)+'</p><p class="text-xs text-slate-400">'+r.kills+' bajas / '+r.deaths+' muertes</p></div><input type="checkbox" name="winner" value="'+r.player_id+'" class="w-5 h-5 rounded"></div>';}).join('');}document.getElementById('winners-modal').classList.add('active');}catch(e){window.showToast('Error: '+e.message,'error');}}
function closeWinnersModal(){document.getElementById('winners-modal').classList.remove('active');}
document.getElementById('winners-form').addEventListener('submit',async function(e){e.preventDefault();var checked=document.querySelectorAll('input[name="winner"]:checked');var winners=Array.from(checked).map(function(cb){return parseInt(cb.value);});if(winners.length===0){window.showToast('Selecciona al menos un ganador','warning');return;}try{for(var i=0;i<winners.length;i++){await window.supabase.from('match_winners').upsert({match_id:matchId,player_id:winners[i],position:i+1},{onConflict:'match_id,player_id'});}await window.supabase.from('matches').update({winners_declared:true}).eq('id',matchId);window.showToast(winners.length+' ganador(es)','success');closeWinnersModal();loadMatch();}catch(e){window.showToast('Error: '+e.message,'error');}});
function copyShareLink(){var input=document.getElementById('share-link');input.select();navigator.clipboard.writeText(input.value);window.showToast('Copiado','success');}

// ===================== IMPORTADOR API (EXCEL K/D) =====================
// Flujo: openAPIImportModal -> fetchAPIKd -> (renderAPIPreview | mapeo manual)
// -> confirmAPIImport. Usa el modulo global window.ApiKdImporter
// (assets/js/api-importer.js, cargado via extraScripts del loader).
var apiImportState={
    data:null,
    rawRows:null,
    headerRowIndex:-1,
    rateLimitTimer:null,
    fetchInProgress:false
};

function apiEscapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function openAPIImportModal(){
    if(!currentMatch){window.showToast('Espera a que cargue la partida','warning');return;}
    document.getElementById('api-import-modal').classList.add('active');
    // Pre-rellenar con el game_id (ID Supremacy) de la partida actual
    var gidInput=document.getElementById('api-game-id');
    if(currentMatch.game_id)gidInput.value=currentMatch.game_id;
    document.getElementById('api-import-error').classList.add('hidden');
    document.getElementById('api-mapping-section').classList.add('hidden');
    document.getElementById('api-preview-section').classList.add('hidden');
    var confirmBtn=document.getElementById('api-confirm-btn');
    confirmBtn.disabled=true;
    confirmBtn.innerHTML='&#10003; Confirmar importacion';
    apiImportState.data=null;apiImportState.rawRows=null;apiImportState.headerRowIndex=-1;
    updateApiCacheNotice();
    startApiRateLimitCountdown();
}

function closeAPIImportModal(){
    document.getElementById('api-import-modal').classList.remove('active');
    if(apiImportState.rateLimitTimer){clearInterval(apiImportState.rateLimitTimer);apiImportState.rateLimitTimer=null;}
}

function startApiRateLimitCountdown(){
    if(apiImportState.rateLimitTimer)clearInterval(apiImportState.rateLimitTimer);
    updateApiFetchButton();
    apiImportState.rateLimitTimer=setInterval(updateApiFetchButton,1000);
}

// Estado del boton "Obtener datos": cuenta atras del rate limit (10s)
function updateApiFetchButton(){
    var btn=document.getElementById('api-fetch-btn');
    if(!btn)return;
    var modal=document.getElementById('api-import-modal');
    if(!modal||!modal.classList.contains('active')){
        if(apiImportState.rateLimitTimer){clearInterval(apiImportState.rateLimitTimer);apiImportState.rateLimitTimer=null;}
        return;
    }
    var refresh=document.getElementById('api-refresh-btn');
    if(apiImportState.fetchInProgress){btn.disabled=true;btn.textContent='Cargando...';if(refresh)refresh.disabled=true;return;}
    var rem=window.ApiKdImporter?window.ApiKdImporter.getRateLimitRemaining():0;
    if(rem>0){
        btn.disabled=true;
        btn.textContent='Espera '+rem+'s';
        if(refresh)refresh.disabled=true;
    }else{
        btn.disabled=false;
        btn.textContent='Obtener datos';
        if(refresh)refresh.disabled=false;
    }
}

// Aviso de cache ("datos en cache de hace X min" + forzar actualizacion)
function updateApiCacheNotice(){
    var notice=document.getElementById('api-cache-notice');
    if(!notice)return;
    var gid=document.getElementById('api-game-id').value.trim();
    var info=(gid&&window.ApiKdImporter)?window.ApiKdImporter.getCacheInfo(gid):null;
    if(info){
        notice.classList.remove('hidden');
        notice.classList.add('flex');
        document.getElementById('api-cache-text').textContent='Datos en cache de hace '+info.ageMin+' min';
    }else{
        notice.classList.add('hidden');
        notice.classList.remove('flex');
    }
}

async function fetchAPIKd(force){
    if(!window.ApiKdImporter){window.showToast('Modulo de importacion API no disponible','error');return;}
    var gid=document.getElementById('api-game-id').value.trim();
    if(!/^\d+$/.test(gid)){window.showToast('Introduce un ID de partida numerico','warning');return;}
    var rem=window.ApiKdImporter.getRateLimitRemaining();
    if(rem>0){window.showToast('Limite de peticiones: espera '+rem+'s','warning');startApiRateLimitCountdown();return;}
    var errBox=document.getElementById('api-import-error');
    errBox.classList.add('hidden');
    apiImportState.fetchInProgress=true;
    updateApiFetchButton();
    try{
        var result=await window.ApiKdImporter.fetchKdExcel(gid,{force:!!force});
        apiImportState.data=result;
        apiImportState.rawRows=result.rawRows;
        apiImportState.headerRowIndex=result.headerRowIndex;
        if(result.fromCache){updateApiCacheNotice();}
        else{var notice=document.getElementById('api-cache-notice');notice.classList.add('hidden');notice.classList.remove('flex');}
        if(result.needsManualMapping){
            fillApiMappingSelects(result.headers);
            renderApiMappingSample();
            document.getElementById('api-mapping-section').classList.remove('hidden');
            document.getElementById('api-preview-section').classList.add('hidden');
            window.showToast('Estructura no reconocida: ajusta el mapeo de columnas','warning');
        }else{
            document.getElementById('api-mapping-section').classList.add('hidden');
            await renderAPIPreview();
            window.showToast('Datos obtenidos: '+result.players.length+' jugadores','success');
        }
    }catch(e){
        errBox.textContent=e.message||'Error desconocido';
        errBox.classList.remove('hidden');
        window.showToast('Error: '+(e.message||e),'error');
    }finally{
        apiImportState.fetchInProgress=false;
        if(document.getElementById('api-import-modal').classList.contains('active'))startApiRateLimitCountdown();
        else updateApiFetchButton();
    }
}

// Rellena los <select> del mapeo manual con las cabeceras detectadas.
// Solo metadata: ID, Username, Nation, Total. Las columnas de stats (unidades/comandantes)
// se detectan automaticamente como las restantes con formato kills/deaths.
function fillApiMappingSelects(headers){
    var fields={'api-map-id':'id','api-map-username':'username','api-map-nation':'nation','api-map-total':'total'};
    Object.keys(fields).forEach(function(elId){
        var el=document.getElementById(elId);
        if(!el)return;
        var html='<option value="">--</option>';
        (headers||[]).forEach(function(h,i){html+='<option value="'+i+'">'+apiEscapeHtml(h)+'</option>';});
        el.innerHTML=html;
        var m=(apiImportState.data&&apiImportState.data.mapping)?apiImportState.data.mapping[fields[elId]]:null;
        if(m!==null&&m!==undefined)el.value=String(m);
    });
}

// Muestra las primeras filas crudas para ayudar al mapeo manual
function renderApiMappingSample(){
    var el=document.getElementById('api-mapping-sample');
    if(!el)return;
    if(!apiImportState.rawRows||!apiImportState.rawRows.length){el.innerHTML='';return;}
    var html='<table class="w-full text-[11px]"><tbody>';
    apiImportState.rawRows.slice(0,4).forEach(function(r){
        html+='<tr class="border-b border-indigo-900">'+(r||[]).map(function(c,i){return '<td class="p-1 whitespace-nowrap"><span class="text-slate-500">['+i+']</span> '+apiEscapeHtml(c===null||c===undefined?'':String(c))+'</td>';}).join('')+'</tr>';
    });
    html+='</tbody></table>';
    el.innerHTML=html;
}

async function applyManualMapping(){
    if(!window.ApiKdImporter||!apiImportState.rawRows){window.showToast('No hay datos para mapear','warning');return;}
    function val(elId){var v=document.getElementById(elId).value;return v===''?null:parseInt(v,10);}
    var mapping={id:val('api-map-id'),username:val('api-map-username'),nation:val('api-map-nation'),total:val('api-map-total'),statColumns:[]};
    if(mapping.id===null){window.showToast('Selecciona la columna de ID de jugador','warning');return;}
    // Detectar columnas de stats automaticamente
    mapping.statColumns=window.ApiKdImporter.detectStatColumns(apiImportState.rawRows,apiImportState.headerRowIndex,mapping);
    if(mapping.statColumns.length===0&&mapping.total===null){window.showToast('Selecciona la columna Total o asegurate de que hay columnas con formato bajas/muertes','warning');return;}
    try{
        var gid=document.getElementById('api-game-id').value.trim();
        var res=window.ApiKdImporter.reparse(apiImportState.rawRows,mapping,apiImportState.headerRowIndex,gid);
        apiImportState.data=res;
        if(res.players.length>0)document.getElementById('api-mapping-section').classList.add('hidden');
        await renderAPIPreview();
        if(res.players.length===0)window.showToast('El mapeo no produjo jugadores validos','warning');
    }catch(e){window.showToast('Error: '+e.message,'error');}
}

// Vista previa (max 20 filas) + contadores. Marca jugadores registrados o no
// en la partida consultando match_registrations.
async function renderAPIPreview(){
    var sec=document.getElementById('api-preview-section');
    var confirmBtn=document.getElementById('api-confirm-btn');
    if(!apiImportState.data){sec.classList.add('hidden');confirmBtn.disabled=true;return;}
    var players=apiImportState.data.players||[];
    var skipped=apiImportState.data.skippedBots||0;
    var errors=apiImportState.data.errors||[];
    // Consultar quien esta registrado en esta partida
    var registeredIds={};
    try{
        if(matchId){
            var{data:regs}=await window.supabase.from('match_registrations').select('player_id').eq('match_id',matchId);
            (regs||[]).forEach(function(r){registeredIds[r.player_id]=true;});
        }
    }catch(e){console.warn('[API Preview] Error cargando registrados:',e);}
    players.forEach(function(p){p.isRegisteredInMatch=!!registeredIds[p.player_id];});
    var registeredCount=players.filter(function(p){return p.isRegisteredInMatch;}).length;
    sec.classList.remove('hidden');
    document.getElementById('api-preview-stats').innerHTML=
        '<span class="px-2 py-1 rounded bg-green-500/15 text-green-500">'+registeredCount+' registrados en partida</span>'+
        '<span class="px-2 py-1 rounded bg-slate-500/15 text-slate-400">'+(players.length-registeredCount)+' no registrados</span>'+
        '<span class="px-2 py-1 rounded bg-slate-500/15 text-slate-400">'+skipped+' bots descartados</span>'+
        '<span class="px-2 py-1 rounded '+(errors.length?'bg-amber-500/15 text-amber-400':'bg-slate-500/15 text-slate-400')+'">'+errors.length+' errores</span>';
    if(players.length===0){
        document.getElementById('api-preview-content').innerHTML='<p class="text-center py-3 text-slate-400">No se encontraron jugadores validos</p>';
        confirmBtn.disabled=true;
        return;
    }
    var html='<table class="w-full text-sm"><thead><tr class="bg-slate-950"><th class="p-2 text-left">ID</th><th class="p-2 text-left">Jugador</th><th class="p-2 text-left">Nacion</th><th class="p-2 text-right">Bajas</th><th class="p-2 text-right">Muertes</th><th class="p-2 text-right">KD</th><th class="p-2 text-left">Estado</th></tr></thead><tbody>';
    players.slice(0,20).forEach(function(p){
        var isReg=p.isRegisteredInMatch;
        var rowClass=isReg?'border-b border-indigo-900':'border-b border-indigo-900 bg-slate-800/40 text-slate-400';
        var statusBadge=isReg?'<span class="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-500">Registrado</span>':'<span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-400">No registrado</span>';
        html+='<tr class="'+rowClass+'"><td class="p-2 font-mono text-xs">'+p.player_id+'</td><td class="p-2 font-medium">'+apiEscapeHtml(p.username||('Jugador '+p.player_id))+'</td><td class="p-2">'+apiEscapeHtml(p.nation||'-')+'</td><td class="p-2 text-right text-green-500">'+p.kills+'</td><td class="p-2 text-right text-red-400">'+p.deaths+'</td><td class="p-2 text-right font-bold">'+p.kd_ratio+'</td><td class="p-2">'+statusBadge+'</td></tr>';
    });
    if(players.length>20)html+='<tr><td colspan="7" class="p-2 text-center text-slate-400">... y '+(players.length-20)+' mas</td></tr>';
    html+='</tbody></table>';
    if(errors.length){
        html+='<div class="mt-2 text-amber-400">'+errors.slice(0,5).map(function(e){return 'Fila '+e.row+': '+apiEscapeHtml(e.reason);}).join('<br>')+(errors.length>5?'<br>... y '+(errors.length-5)+' errores mas':'')+'</div>';
    }
    document.getElementById('api-preview-content').innerHTML=html;
    confirmBtn.disabled=players.length===0;
}

async function confirmAPIImport(){
    if(!apiImportState.data||!apiImportState.data.players||apiImportState.data.players.length===0){window.showToast('No hay datos para importar','warning');return;}
    if(!matchId){window.showToast('No hay partida seleccionada','error');return;}
    var btn=document.getElementById('api-confirm-btn');
    btn.disabled=true;btn.textContent='Importando...';
    var createMissing=document.getElementById('api-create-players').checked;
    // Todos los jugadores con UID positivo se importan; su validez para ranking depende de match_registrations.
    var players=apiImportState.data.players;
    var registeredCount=players.filter(function(p){return p.isRegisteredInMatch;}).length;
    try{
        // 1) Comprobar que jugadores existen ya en el sistema (ids unicos, en bloques)
        var ids=players.map(function(p){return p.player_id;}).filter(function(v,i,a){return a.indexOf(v)===i;});
        var existing={};
        for(var off=0;off<ids.length;off+=100){
            var chunk=ids.slice(off,off+100);
            var q=await window.supabase.from('players').select('id').in('id',chunk);
            if(q.error)throw q.error;
            (q.data||[]).forEach(function(p){existing[String(p.id)]=true;});
        }
        var missing=players.filter(function(p){return !existing[String(p.player_id)];});
        // 2) Crear jugadores que no existan (opcional; el INSERT publico esta permitido por RLS).
        //    NUNCA se tocan total_kills/total_deaths/games_played: los recalculan triggers SQL.
        if(createMissing){
            for(var mi=0;mi<missing.length;mi++){
                var mp=missing[mi];
                var ins=await window.supabase.from('players').insert({id:mp.player_id,current_username:mp.username||('Jugador '+mp.player_id),status:'active'});
                if(ins.error&&ins.error.code!=='23505')throw ins.error; // 23505 = duplicado por condicion de carrera
            }
        }
        // Si no se crean, se importan solo los que ya existen (evita errores de FK)
        var toImport=createMissing?players:players.filter(function(p){return existing[String(p.player_id)];});
        var fkSkipped=players.length-toImport.length;
        if(toImport.length===0)throw new Error('Ninguno de los jugadores existe en el sistema. Marca "Crear jugadores que no existan" para importarlos.');
        // 3) Upsert de resultados (mismo patron que confirmCSVImport)
        for(var i=0;i<toImport.length;i++){
            var r=toImport[i];
            var kd=r.deaths>0?(r.kills/r.deaths):r.kills;
            var row={match_id:matchId,player_id:r.player_id,kills:r.kills,deaths:r.deaths,kd_ratio:parseFloat(kd.toFixed(2))};
            if(r.nation)row.nation=r.nation;
            var up=await window.supabase.from('match_results').upsert(row,{onConflict:'match_id,player_id'});
            if(up.error)throw up.error;
        }
        // 4) Marcar la partida como importada (igual que el flujo CSV)
        var um=await window.supabase.from('matches').update({csv_imported:true}).eq('id',matchId);
        if(um.error)throw um.error;
        // 5) Resumen + refresco de la pagina
        var summary='API importada: '+toImport.length+' jugadores · '+registeredCount+' registrados en partida · '+(players.length-registeredCount)+' no registrados · '+apiImportState.data.skippedBots+' bots descartados · '+apiImportState.data.errors.length+' errores';
        if(fkSkipped>0)summary+=' · '+fkSkipped+' sin ficha (no creados)';
        window.showToast(summary,'success');
        closeAPIImportModal();
        loadResults();
        loadMatch();
    }catch(e){
        window.showToast('Error: '+e.message,'error');
    }finally{
        btn.disabled=false;
        btn.innerHTML='&#10003; Confirmar importacion';
    }
}

loadMatch();
