import re

with open('controle-demandas/script.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Configuracoes
content = content.replace(
    'await db.collection("configuracoes").doc("geral").set(configuracoes);',
    'await supabase.from("configuracoes").upsert([{ "id": "geral", "dados": configuracoes }]);'
)

# 2. Deletes
content = content.replace(
    'await db.collection(collectionName).doc(String(actionId)).delete();',
    'await supabase.from(collectionName).delete().eq("id", String(actionId));'
)
content = content.replace(
    'await db.collection("usuarios").doc(String(actionId)).delete();',
    'await supabase.from("usuarios").delete().eq("id", String(actionId));'
)
content = content.replace(
    'await db.collection("guias").doc(String(actionId)).delete();',
    'await supabase.from("guias").delete().eq("id", String(actionId));'
)

# 3. Single Item Transfers
content = content.replace(
    'await db.collection("historico").doc(String(actionId)).set(demandaTransferida);\n                        await db.collection("demandas").doc(String(actionId)).delete();',
    'await supabase.from("historico").insert([demandaTransferida]);\n                        await supabase.from("demandas").delete().eq("id", String(actionId));'
)
content = content.replace(
    'await db.collection("demandas").doc(String(actionId)).set(demandaRetornada);\n                        await db.collection("historico").doc(String(actionId)).delete();',
    'await supabase.from("demandas").insert([demandaRetornada]);\n                        await supabase.from("historico").delete().eq("id", String(actionId));'
)

# 4. Form Submission
content = content.replace(
    'await db.collection(collectionName).doc(String(editingId)).update(dadosFormulario);',
    'await supabase.from(collectionName).update(dadosFormulario).eq("id", String(editingId));'
)
content = content.replace(
    'await db.collection("demandas").add(dadosFormulario);',
    'await supabase.from("demandas").insert([dadosFormulario]);'
)

# 5. Usuarios Edit/Add
content = content.replace(
    'await db.collection("usuarios").doc(String(editingUsuarioId)).update(userData);',
    'await supabase.from("usuarios").update(userData).eq("id", String(editingUsuarioId));'
)
content = content.replace(
    'await db.collection("usuarios").add(userData);',
    'await supabase.from("usuarios").insert([userData]);'
)

# 6. Guias Edit/Add
content = content.replace(
    'await db.collection("guias").doc(currentEditGuiaId).update(dataObj);',
    'await supabase.from("guias").update(dataObj).eq("id", currentEditGuiaId);'
)
content = content.replace(
    'await db.collection("guias").add(dataObj);',
    'await supabase.from("guias").insert([dataObj]);'
)

# 7. Clear Logs
content = content.replace(
    'const snap = await db.collection("logs").get();\n                    const batch = db.batch();\n                    snap.docs.forEach(doc => batch.delete(doc.ref));\n                    await batch.commit();',
    'await supabase.from("logs").delete().neq("id", "0");'
)

with open('controle-demandas/script.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("done")
