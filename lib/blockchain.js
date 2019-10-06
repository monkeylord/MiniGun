var bsv = require('bsv')
var Utils = require('./utils')
var Peer = require('bitcore-p2p-cash').Peer
var Messages = require('bitcore-p2p-cash').Messages
var fs = require('fs')

const TypeBlock = 2
const bsvMessages = new Messages({Block: bsv.Block, 
    BlockHeader: bsv.BlockHeader,
    Transaction: bsv.Transaction,
    MerkleBlock: bsv.MerkleBlock
})
const Type = [
    'Error',
    'Transaction',
    'Block',
    'Filtered Block',
    'Cmpct Block'
]


function BlockChain(peerAddr){
    Peer.call(this, {host: peerAddr, messages: bsvMessages})
    this.addrListener = []
    this.unfired = []
    this.ready = false
    /*
    if (!(this instanceof BlockChain)) {
        return new BlockChain()
    }
    */

    this.on('ready', function() {
        // peer info
        global.log.log(`[BlockChain] Peer connected, protocol: ${this.version}, version: ${this.subversion}, height: ${this.bestHeight}`)
        this.ready = true
        var bucket = this.unfired
        this.unfired = []
        if(bucket.length>0)global.log.log(`[BlockChain] Fire ${bucket.length} unfired(s)`)
        bucket.forEach(tx=>this.broadcast(tx))
    })
    this.on('inv', function(message) {
        // console.log('Incoming Inv')
        message.inventory.forEach(item=>{
            if(item.type===TypeBlock) {
                global.log.log(`[BlockChain] ${Type[item.type]} ${item.hash.toString('hex')} Found.`)
                this.sendMessage(this.messages.GetData(message.inventory))
            }
        })
    })
    this.on('disconnect', function(){
        global.log.log('[BlockChain] Connection lost, reconnect.')
        this.ready = false
        this.connect()
    })
    this.on('error', function() {
        this.ready = false
        global.log.log('[BlockChain] connection lost');
    })
    this.on('block', function(message) {
        global.log.log('[BlockChain] New Block Received')
        fs.writeFileSync(`${message.block.id}.block`,message.block.toString())
        this.addrListener.forEach(listener=>{
            var utxos = Utils.getUTXOsFromBlock(message.block, listener.Script)
            listener.Callback(utxos)
        })
    });
    this.on('reject',function(message){
        global.log.log(`[BlockChain] ${message.message} ${message.data.reverse().toString('hex')} rejected, reason: ${message.reason}`)
    })

    this.connect()
}
BlockChain.prototype = Peer.prototype

BlockChain.prototype.getReady = async function () {
    var self = this
    var p = new Promise((resolve, reject) => {
        var func = () => {
            if(self.ready)resolve()
            else setTimeout(func, 100)
        }
        func()
    });
    return p;
  }

BlockChain.prototype.listenAddr = function(addr, callback){
    var script = Utils.createScript(bsv.Address(addr))
    this.addrListener.push({Address: addr, Callback: callback, Script: script})
}

BlockChain.prototype.broadcast = function(tx){
    if(global.mock){
        // mock, do nothing now
        global.log.log(`mock firing ${tx.id} ${tx.inputs.length} in(s), ${tx.outputs.length} out(s), size ${tx.toString().length/2} Bytes, fee ${tx.inputAmount - tx.outputAmount}`)
        return
    }else{
        if(this.ready){
            global.log.log(`firing ${tx.id} ${tx.inputs.length} in(s), ${tx.outputs.length} out(s), size ${tx.toString().length/2} Bytes, fee ${tx.inputAmount - tx.outputAmount}`)
            this.sendMessage(this.messages.Transaction(tx))
        }else{
            this.unfired.push(tx)
        }
    }
}

BlockChain.prototype.getUTXOs = function(addr){
    // mock
    var utxo = {
        txId:'aa947f4e131587a807a7b3d748e41b0f3ce3e67883449d0ceb9369a8f2535357',
        outputIndex: 0,
        satoshis:1000000,
        script:'76a91429440991777a76f611cf67ac62d015d2ba10109f88ac'
    }
    return new Promise((resolve,reject)=>{
        resolve([utxo])
    })
}

module.exports = BlockChain