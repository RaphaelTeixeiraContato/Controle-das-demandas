import re

with open('controle-demandas/script.js', 'r', encoding='utf-8') as f:
    content = f.read()

bulk_delete_original = '''        try {
            const batch = db.batch();
            const collectionName = currentPage === 'abertas' ? 'demandas' : 'historico';
            
            selectedIds.forEach(id => {
                const ref = db.collection(collectionName).doc(id);
                batch.delete(ref);
            });
            
            await batch.commit();'''

bulk_delete_new = '''        try {
            const collectionName = currentPage === 'abertas' ? 'demandas' : 'historico';
            await supabase.from(collectionName).delete().in('id', selectedIds);'''

content = content.replace(bulk_delete_original, bulk_delete_new)

bulk_transfer_original = '''        try {
            const batch = db.batch();
            
            if (currentPage === 'abertas') {
                selectedIds.forEach(id => {
                    const demanda = demandas.find(d => d.id === id);
                    if (demanda) {
                        const historicoItem = {
                            responsavel: demanda.responsavel,
                            assessor: demanda.assessor,
                            cliente: demanda.cliente,
                            demanda: demanda.demanda,
                            meio: demanda.meio,
                            protocolo: demanda.protocolo,
                            comentarios: demanda.comentarios,
                            data: demanda.data,
                            dataEncerramento: dataEncerramento,
                            motivoEncerramento: motivoEncerramento,
                            timestampEncerramento: Date.now(),
                            originalId: id
                        };
                        const newRef = db.collection("historico").doc();
                        batch.set(newRef, historicoItem);
                        batch.delete(db.collection("demandas").doc(id));
                    }
                });
                registrarLog('Transferiu Demandas em Lote', \Transferiu \ demandas para o histórico.\);
            } else {
                selectedIds.forEach(id => {
                    const historicoItem = historico.find(d => d.id === id);
                    if (historicoItem) {
                        const demandaReaberta = {
                            responsavel: historicoItem.responsavel,
                            assessor: historicoItem.assessor,
                            cliente: historicoItem.cliente,
                            demanda: historicoItem.demanda,
                            meio: historicoItem.meio,
                            protocolo: historicoItem.protocolo,
                            comentarios: historicoItem.comentarios,
                            data: historicoItem.data,
                            timestamp: Date.now()
                        };
                        const newRef = db.collection("demandas").doc();
                        batch.set(newRef, demandaReaberta);
                        batch.delete(db.collection("historico").doc(id));
                    }
                });
                registrarLog('Retornou Demandas em Lote', \Retornou \ demandas para Abertas.\);
            }
            
            await batch.commit();'''

bulk_transfer_new = '''        try {
            if (currentPage === 'abertas') {
                const historicoItems = [];
                const idsToDelete = [];
                selectedIds.forEach(id => {
                    const demanda = demandas.find(d => d.id === id);
                    if (demanda) {
                        historicoItems.push({
                            responsavel: demanda.responsavel,
                            assessor: demanda.assessor,
                            cliente: demanda.cliente,
                            demanda: demanda.demanda,
                            meio: demanda.meio,
                            protocolo: demanda.protocolo,
                            comentarios: demanda.comentarios,
                            data: demanda.data,
                            dataEncerramento: dataEncerramento,
                            motivoEncerramento: motivoEncerramento,
                            timestampEncerramento: Date.now(),
                            originalId: id
                        });
                        idsToDelete.push(id);
                    }
                });
                if (historicoItems.length > 0) {
                    await supabase.from("historico").insert(historicoItems);
                    await supabase.from("demandas").delete().in("id", idsToDelete);
                }
                registrarLog('Transferiu Demandas em Lote', \Transferiu \ demandas para o histórico.\);
            } else {
                const demandaItems = [];
                const idsToDelete = [];
                selectedIds.forEach(id => {
                    const historicoItem = historico.find(d => d.id === id);
                    if (historicoItem) {
                        demandaItems.push({
                            responsavel: historicoItem.responsavel,
                            assessor: historicoItem.assessor,
                            cliente: historicoItem.cliente,
                            demanda: historicoItem.demanda,
                            meio: historicoItem.meio,
                            protocolo: historicoItem.protocolo,
                            comentarios: historicoItem.comentarios,
                            data: historicoItem.data,
                            timestamp: Date.now()
                        });
                        idsToDelete.push(id);
                    }
                });
                if (demandaItems.length > 0) {
                    await supabase.from("demandas").insert(demandaItems);
                    await supabase.from("historico").delete().in("id", idsToDelete);
                }
                registrarLog('Retornou Demandas em Lote', \Retornou \ demandas para Abertas.\);
            }'''

content = content.replace(bulk_transfer_original, bulk_transfer_new)

with open('controle-demandas/script.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("done bulk")
