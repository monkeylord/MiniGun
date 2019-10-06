const fetch = require('node-fetch')

function getUTXOs(addr){
    return fetch(`https://api.bitindex.network/api/addr/${addr.toString()}/utxo`).then(res=>{
        if (res.status==200) return res.json()
        else throw new Error('Request not successful.')
    }).then(utxos=>{
        return utxos.filter(utxo=>utxo.height!=undefined).filter(utxo=>utxo.confirmations>0)
    })
}

module.exports.getUTXOs = getUTXOs