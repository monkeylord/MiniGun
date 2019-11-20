#!/usr/bin/env node

//global.SplitRato = 25   // 分裂率 决定了一个父UTXO应该分裂为几个子UTXO
//global.MaxLevel = Math.floor(Math.log(1000000000000)/Math.log(global.SplitRato))    // 用于预计算费率表
//global.TransactionSize = 300    // TX基础大小，用于预计算费率
//global.OutputSize = 35  // 每增加一个输出，TX大小增加值，用于预计算费率
//global.InputSize = 45   // 每增加一个输入，TX大小增加值，用于预计算费率
global.reloadTheshold = 10000   // 重装填阈值，可发射UTXO低于此值则尝试重装填补充弹药
global.recycleTheshold = 300    // 回收阈值，决定了每个回收交易最大应该包含多少个输入，以规避最大TX大小限制
//global.Level0Fee = 546 + global.TransactionSize     // 低于此值则尝试回收UTXO

//global.LevelTheshold = 5     // level高于此值则尝试快速分裂

global.debug = true     // 表示调试模式是否开启，没什么用
global.mock = false      // Mock测试模式，并不真的广播TX，不消耗弹药
global.log = console // 全局日志，没什么用
global.bullets = []
global.load = false

var bsv = require('bsv')
var inquirer = require('inquirer')
var ibe = require('bitcoin-ibe')    //  它会补充BSV的方法，尽管本身没调用过。
var Barrel = require('./lib/barrel')
var Utils = require('./lib/utils')
var BlockChain = require('./lib/blockchain')
var Client = require('./lib/client')
var Log = require('./lib/log')
var fs = require('fs')
var cluster = require('cluster')

var SourceAddr
var SourcePrivateKey
var recycleAddr
var recyclePrivateKey
var barrelAddr
var barrelPrivateKey
// UTXO is ammo, so the ammo is chained because UTXO is chained.

var chain
var barrel

var initialLoaded = false
global.reload = function (continueFire) {
    if(global.threshold == 0 || !initialLoaded){
        barrel.loadFrom(SourcePrivateKey)
        barrel.loadFrom(recyclePrivateKey)
        if (!continueFire && !global.load) barrel.loadFrom(barrelPrivateKey)

        initialLoaded = true
    }
}

//  First trigger
var questions = [
    { type: "password", name: "key", message: "Ammo Source - Bitcoin Private Key:" },
    { type: "input", name: "peer", message: "Peer Addr:", default: '39.105.149.36' },
    { type: "input", name: "log", message: "Log File:", default: `Minigun.${new Date().getTime()}.log` },
    { type: "input", name: "mode", message: "Mode(auto/load/fire)", default: "auto" },
    { type: "Number", name: "threshold", message: "Max Transaction Per Block", default: 0 }
]

// 询问用户弹药私钥地址，以及分裂率，更高的分裂率更爆发，但是往往只能持续两三个块。低分裂率更持久
inquirer.prompt(questions).then(answers => {
    if (bsv.PrivateKey.isValid(answers.key)) {
        /*
 
        global.MaxLevel = Math.floor(Math.log(1000000000000)/Math.log(global.SplitRato))
        Barrel.calcFeeLevel()
        */
        global.threshold = answers.threshold
        global.log = new Log(answers.log)
        process.on("SIGINT", function () {
            if (global.load) {
                fs.writeFileSync("txs.json", JSON.stringify(global.bullets, " "))
                global.log.log(`[Minigun] ${global.bullets.length} TX bullet(s) saved to txs.json`)
            }
            global.log.end()
            process.exit()
        })
        SourcePrivateKey = bsv.PrivateKey(answers.key)
        SourceAddr = SourcePrivateKey.toAddress()
        recyclePrivateKey = SourcePrivateKey.childKey('recycle', true)
        recycleAddr = recyclePrivateKey.toAddress()
        barrelPrivateKey = SourcePrivateKey.childKey('minigun', true)
        barrelAddr = barrelPrivateKey.toAddress()
        global.log.log(`[Minigun] Your Minigun Barrel Address is ${barrelAddr.toString()}, PrivateKey: ${barrelPrivateKey.toString()}`)
        global.log.log(`[Minigun] Your Minigun Recycle Address is ${recycleAddr.toString()}, PrivateKey: ${recyclePrivateKey.toString()}`)
        global.log.log(`[Minigun] Your Minigun Ammo Source Address is ${SourceAddr.toString()}`)
        global.log.log('[Minigun] The Minigun Addresses are determinitically derived from Source, so it will not change if you use the same Ammo Source.')
        global.log.log('[Minigun] Method 42 is applied, so please be noticed that this tool can only be used on BSV.')
        chain = new BlockChain(answers.peer)
        barrel = new Barrel(barrelPrivateKey, recycleAddr, chain)
        chain.listenAddr(SourceAddr, utxos => {
            if (utxos.length > 0) {
                global.log.log(`[Minigun] New ammo arrived, Loading from ammo source`)
                barrel.loadFrom(SourcePrivateKey, utxos)
            }
        })

        if (answers.mode == "fire") {
            // fire prepared TXs
            global.log.log("[Minigun] Mode fire, loading TXs from txs.json")
            global.bullets = JSON.parse(fs.readFileSync("txs.json")).map(tx => bsv.Transaction(tx))
            chain.getReady().then(() => {
                var startTime = new Date().getTime()
                global.bullets.forEach(tx => chain.broadcast(tx))
                global.log.log(`[Minigun] ${global.bullets.length} prepared ammo fired in ${new Date().getTime() - startTime}ms, ${Math.floor(global.bullets.length / ((new Date().getTime() - startTime) / 1000))} TPS.`)
            })
        } else {
            // Mode auto/load
            // if mode load, keep the bullets
            if (answers.mode == "load") global.load = true
            Client.getUTXOs(barrelAddr).then(utxos => {
                global.log.log('[Minigun] Unfired Ammo(UTXOs):' + utxos.length)
                barrel.fireUTXOs(utxos)
                //utxos.forEach(utxo=>barrel.fireUTXO(utxo))
            })
            reload(true)
        }
    } else {
        global.log.log('Invaild Private Key')
        process.exit()
    }
}).catch(console.log)

