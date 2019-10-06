var bsv = require('bsv')

function createUTXOs(TX){
    var tx = bsv.Transaction(TX)
    var utxos = []
    for(var i = 0; i < tx.outputs.length; i++){
        utxos.push({
            txId: tx.id,
            vout: i,
            satoshis: tx.outputs[i].satoshis,
            address: tx.outputs[i].script.toAddress(),
            script: tx.outputs[i].script.toHex()
        })
    }
    return utxos
}

function getUTXOsFromBlock(block, script){
    var transactions = block.transactions
    var utxos = []
    transactions.forEach(tx=>{
        for (var i = 0; i < tx.outputs.length; i++){
            if (tx.outputs[i].script.equals(script)) {
                utxos.push({
                    txId: tx.id,
                    vout: i,
                    satoshis: tx.outputs[i].satoshis,
                    address: tx.outputs[i].script.toAddress(),
                    script: tx.outputs[i].script.toHex()
                })
            }
        }
    })
    return utxos
}



function createScript(address){
    return bsv.Script.buildPublicKeyHashOut(address)
}
module.exports.createUTXOs = createUTXOs
module.exports.getUTXOsFromBlock = getUTXOsFromBlock
module.exports.createScript = createScript
