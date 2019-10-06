var logfile
var fs = require('fs')

function Log(logfile){
    this.count = 0
    this.size = 0
    this.logStream = fs.createWriteStream(logfile);
}

Log.prototype.record = function(TX){
    this.count++
    //console.log(`${TX.id} ${this.count++}`)
    this.size+=TX.toString().length/2
}

Log.prototype.log = function(string){
    if(global.debug)console.log(string)
    this.logStream.write(string)
    this.logStream.write("\r\n")
}
Log.prototype.end = function(){
    this.logStream.end()
}

module.exports = Log