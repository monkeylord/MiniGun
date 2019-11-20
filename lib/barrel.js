var bsv = require('bsv')
var Utils = require('./utils')
var Client = require('./client')

var levelfees = []
const FEE_PER_KB = 1050
const MAX_OUTS_PER_TX = 1000
const OUTPUT_SIZE = 80
const INPUT_SIZE = 150
const DUST_LIMIT = 536
const BASE_TX_SIZE = 250
//const FIRE_THESHOLD = 750
const FIRE_THESHOLD = DUST_LIMIT + (BASE_TX_SIZE + INPUT_SIZE + OUTPUT_SIZE) * FEE_PER_KB / 1000

function Barrel(privateKey, recycleAddr, blockChain) {
    if (!(this instanceof Barrel)) {
        return new Barrel(privateKey, recycleAddr, blockChain)
    }
    this.privateKey = bsv.PrivateKey(privateKey)
    this.script = Utils.createScript(this.privateKey.toAddress())
    this.barrelAddr = this.privateKey.toAddress()
    this.recycleAddr = recycleAddr
    this.blockChain = blockChain
    this.blockChain.listenAddr(this.privateKey.toAddress(), (utxos) => {
        this.fireUTXOs(utxos)
    })
    this.recycleBucket = []
    this.holdBucket = []
    this.blockChain.listenAddr(recycleAddr, (utxos) => {
        this.recycleBucket = this.recycleBucket.concat(utxos)
        if (this.recycleBucket.length > 800) global.reload(true)
    })
}
/*
// pre-calculate fees
Barrel.nextlevelfee = function (levelfee) {
    return global.TransactionSize + (levelfee + global.OutputSize) * (global.SplitRato - 1)
}

Barrel.calcFeeLevel = function () {
    // recalculate fee level
    var fee = global.Level0Fee
    levelfees = []
    for (var i = 0; i < global.MaxLevel; i++) {
        levelfees[i] = fee
        var fee = Barrel.nextlevelfee(fee)
    }
}
Barrel.calcFeeLevel()
*/
Barrel.prototype.fireUTXOs = async function (utxos) {
    // recoil and load
    var startTime = new Date().getTime()
    global.log.log(`[Minigun] Loading ${utxos.length} Ammo(UTXOs)`)
    //global.log.log(utxos)
    if(global.threshold!=0){
        // Threshold control
        var canfire = this.blockChain.count
        this.holdBucket = this.holdBucket.concat(utxos)
        utxos = this.holdBucket.slice(0,canfire)
        this.holdBucket = this.holdBucket.slice(canfire)
    }
    //utxos.forEach(utxo => this.fireUTXO(utxo))
    // async processing, avoid blocking
    for(var i=0; i<utxos.length; i++){
        await this.fireUTXO(utxos[i])
    }
    
    if(global.load)global.log.log(`[Minigun] ${utxos.length} UTXO ammo handled in ${new Date().getTime() - startTime}ms`)
    else global.log.log(`[Minigun] ${utxos.length} UTXO ammo fired in ${new Date().getTime() - startTime}ms, ${Math.floor(utxos.length / ((new Date().getTime() - startTime) / 1000))} TPS - ${new Date().getTime()}`)
    
    if (this.recycleBucket > 100) this.loadFrom(this.privateKey, this.recycleBucket)
    if (utxos.length < global.reloadTheshold) {
        global.log.log('[Minigun] Firable ammo below reload theshold, try reloading.')
        global.reload()
    }
}

Barrel.prototype.fireUTXO = async function (utxo) {
    var tx = await this.buildTX(utxo)
    if(tx && global.load){
        global.bullets.push(tx)
    }else {
        await this.blockChain.getReady()
        this.fireTX(tx)
    }
}

Barrel.prototype.buildTX = async function (utxo) {
    // 使用Change链，而非分裂
    var tx = bsv.Transaction()
    if (utxo.satoshis < FIRE_THESHOLD) {
        // Fire Shell
        if (utxo.satoshis < DUST_LIMIT + BASE_TX_SIZE) {
            // useless
            this.recycleBucket.push(utxo)
            return null
        }
        tx.from(utxo).change(this.recycleAddr)
        tx.feePerKb(FEE_PER_KB)
    } else {
        // Load Shell
        //global.log.log("[Minigun] A utxo with lots of satoshis, making it a ammo chain")
        var nOut = Math.min(MAX_OUTS_PER_TX, Math.floor((utxo.satoshis - BASE_TX_SIZE - DUST_LIMIT - OUTPUT_SIZE) / (FIRE_THESHOLD + OUTPUT_SIZE)))
        while (nOut-- > 0) tx.to(this.barrelAddr, FIRE_THESHOLD)
        tx.from(utxo)
        if (tx.inputAmount - tx.outputAmount > DUST_LIMIT + OUTPUT_SIZE + tx.toString().length / 2 + BASE_TX_SIZE) {
            tx.change(this.recycleAddr)
            tx.feePerKb(FEE_PER_KB)
        }
    }
    tx.sign(this.privateKey)
    return tx
}
/*
Barrel.prototype.buildTXEX = function (utxo) {
    var level = global.MaxLevel - 1
    while (utxo.satoshis < levelfees[level]) level--
    var tx = bsv.Transaction()
    if (level <= 0) {
        // recycle shell
        tx.from(utxo).change(this.recycleAddr)
    } else {
        // Split
        tx.from(utxo)
        if (level > global.LevelTheshold) {
            // 加速分裂（2倍）
            var splitTarget = (global.SplitRato - 1) * (global.SplitRato - 1)
            var splitValue = levelfees[level - 2]
        } else {
            // 正常分裂
            var splitTarget = global.SplitRato - 1
            var splitValue = levelfees[level - 1]
        }
        // 生成分裂output
        for (var i = 0; i < (splitTarget); i++) {
            tx.to(this.nextBarrelAddr, splitValue)
        }
        // 回收剩余资金
        var change = utxo.satoshis - splitValue * splitTarget
        if (change > 546) tx.change(this.recycleAddr)
    }
    tx.sign(this.privateKey)
    return tx
}
*/
Barrel.prototype.fireTX = function (tx) {
    if (tx) this.blockChain.broadcast(tx)
}

Barrel.prototype.setRecycle = function (recycleAddr) {
    this.recycleAddr = recycleAddr
}

Barrel.prototype.loadFrom = function (privateKey, providedUTXOs) {
    var barrelAddr = this.privateKey.toAddress()
    var ammoAddr = bsv.PrivateKey(privateKey).toAddress()
    var getUTXOs
    global.log.log(`[Minigun] Loading from ${ammoAddr}`)
    // load from recycle bucket if there are utxos in recycle bucket
    if (this.recycleBucket.filter(utxo => utxo.address == ammoAddr).length > 10) {
        getUTXOs = new Promise((resolve, reject) => {
            global.log.log(`[Minigun] Loading in-bucket utxos from ${ammoAddr.toString()}`)
            var utxos = this.recycleBucket.filter(utxo => utxo.address == ammoAddr)
            this.recycleBucket = this.recycleBucket.filter(utxo => utxo.address != ammoAddr)
            resolve(utxos)
        })
    } else if (providedUTXOs && Array.isArray(providedUTXOs)) {
        global.log.log(`[Minigun] Initial loading`)
        getUTXOs = new Promise((resolve, reject) => {
            resolve(providedUTXOs)
        })
    } else {
        global.log.log(`[Minigun] Querying loadable ammo from API`)
        getUTXOs = Client.getUTXOs(ammoAddr).catch(e => {
            console.log(`Exception during loading ${ammoAddr.toString()}`)
            console.log(e)
            return []
        })
    }
    var startTime = new Date().getTime()
    return getUTXOs.then(utxos => {
        global.log.log(`[Minigun] Ammo(UTXOs) can be loaded from ${ammoAddr.toString()}: ${utxos.length}`)
        if (utxos.length == 0) return []
        var txs = []
        var oneRound = FIRE_THESHOLD * MAX_OUTS_PER_TX
        var aggregateUtxos = utxos.filter(utxo => utxo.satoshis < oneRound)
        var roundUtxos = utxos.filter(utxo => utxo.satoshis >= oneRound)
        // Round to bullets
        roundUtxos.forEach(utxo => {
            var nRound = Math.min(MAX_OUTS_PER_TX, Math.floor((utxo.satoshis - BASE_TX_SIZE - INPUT_SIZE - DUST_LIMIT - OUTPUT_SIZE) / (FIRE_THESHOLD * MAX_OUTS_PER_TX + OUTPUT_SIZE)))
            var nBullet = Math.min(MAX_OUTS_PER_TX, Math.floor((utxo.satoshis - BASE_TX_SIZE - INPUT_SIZE - DUST_LIMIT - OUTPUT_SIZE - nRound * (FIRE_THESHOLD * MAX_OUTS_PER_TX + OUTPUT_SIZE)) / (FIRE_THESHOLD + OUTPUT_SIZE)))
            global.log.log(`[Minigun] Pushing ${nRound} round(s) and ${nBullet} bullet(s) into ammo case`)
            var tx = bsv.Transaction()
            tx.addData(["Stress Test", "[G] Heavy MachineGun!"])
            while (nRound-- > 0) tx.to(this.recycleAddr, FIRE_THESHOLD * MAX_OUTS_PER_TX)
            while (nBullet-- > 0) tx.to(barrelAddr, FIRE_THESHOLD)
            tx.from(utxo)
            tx.feePerKb(FEE_PER_KB)
            tx.change(this.recycleAddr)
            tx.sign(privateKey)
            txs.push(tx)
            if (tx.isFullySigned()) {
                this.fireTX(tx)
            }
        })
        // aggregate to rounds and bullets
        while (aggregateUtxos.length > 0) {
            utxoschunk = aggregateUtxos.slice(0, global.recycleTheshold)
            aggregateUtxos = aggregateUtxos.slice(global.recycleTheshold)

            var satoshisTotal = utxoschunk.reduce((total, utxo) => total + utxo.satoshis, 0)
            var nRound = Math.min(MAX_OUTS_PER_TX, Math.floor((satoshisTotal - BASE_TX_SIZE - utxoschunk.length * INPUT_SIZE - DUST_LIMIT - OUTPUT_SIZE) / (FIRE_THESHOLD * MAX_OUTS_PER_TX + OUTPUT_SIZE)))
            var nBullet = Math.min(MAX_OUTS_PER_TX, Math.floor((satoshisTotal - BASE_TX_SIZE - utxoschunk.length * INPUT_SIZE - DUST_LIMIT - OUTPUT_SIZE - nRound * (FIRE_THESHOLD * MAX_OUTS_PER_TX + OUTPUT_SIZE)) / (FIRE_THESHOLD + OUTPUT_SIZE)))
            global.log.log(`[Minigun] Recycling ${utxoschunk.length} utxo(s) into ${nRound} round(s) and ${nBullet} bullet(s), ${aggregateUtxos.length} utxo(s) remains.`)
            var tx = bsv.Transaction()
            tx.addData(["Stress Test", "[G] Heavy MachineGun!"])
            while (nRound-- > 0) tx.to(this.recycleAddr, FIRE_THESHOLD * MAX_OUTS_PER_TX)
            while (nBullet-- > 0) tx.to(barrelAddr, FIRE_THESHOLD)
            utxoschunk.forEach(utxo => {
                // each input require a ECDSA sign, it's quite slow.
                tx.from(utxo)
            })
            tx.feePerKb(FEE_PER_KB)
            tx.change(this.recycleAddr)
            tx.sign(privateKey)
            txs.push(tx)
            // fire immediately, because it takes a long time to assemble all recycle TXs, long enough to lost connection with node.
            if (tx.isFullySigned()) {
                this.fireTX(tx)
            }
        }
        return txs
    }).then(txs => {
        if(txs.length>0)global.log.log(`[Minigun] Reloaded from ${ammoAddr.toString()} in ${new Date().getTime() - startTime}ms`)
    })
}

module.exports = Barrel