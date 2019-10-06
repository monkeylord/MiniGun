// TODO
const fetch = require('node-fetch')
var BlockChain = require('./blockchain')

function api(){

}

api.prototype.broadcast = function(){

}

api.prototype.listenAddr = function(){
    
}

function getUTXOs(addr){
    return fetch(`https://bchsvexplorer.com/api/addr/${addr.toString()}/utxo`).then(res=>{
        if (res.status==200) return res.json()
        else throw new Error('Request not successful.')
    }).then(utxos=>{
        return utxos.filter(utxo=>utxo.height!=undefined)
    })
}



module.exports = api