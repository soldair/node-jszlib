
var jszlib = require('./lib/zlib.js');

var deflateSync;

exports.deflate = function(buffer,options,cb){
  var args = _args(arguments,true),deflate,res,e,err;
  process.nextTick(function(){
    var err,res;
    try{
      res = deflateSync(args.buffer,args,options);
    } catch(e){
      err = e;
    }
    args.cb(err,res);
  });
};

//exports.deflateRaw = function (buffer,options,cb){
//  var args = _args(arguments,true);
//}

deflateSync = exports.deflateSync = function(buffer,options){
  var args = _args(arguments);
  var deflate = new jszlib.Deflate();
  res = deflate.compress(args.buffer);

  if(!options.array_buffer) {
    res = zlibBufferToNodeBuffer(res);
  }

  return res;
};

//exports.deflateRawSync = function(buffer,options){
//  var args = _args(arguments);
//}

exports.inflateSync = exports.inflate = exports.inflateRaw = inflateRawSync = function(){
  throw new Error('inflate is not supported yet ;) use node native. require("zlib")');
};


function _args(args,async){

  var cb,
  buffer,
  options;

  args = Array.prototype.slice.call(args);

  if(async){
    cb = args.pop();
    if(typeof cb != 'function') throw new TypeError('callback must be provided and be a function');
  }

  buffer = args.shift();
  options = args.shift()||{};
  
  // i know binary is depricated =(
  if(buffer instanceof Buffer) buffer = buffer.toString('binary');

  return {buffer:buffer,options:options,cb:cb};
}

function zlibBufferToNodeBuffer(data){
      var buf = new Buffer(data.length);
      for(var i = 0,j = data.length;i<j;++i) {
        buf.writeUInt8(data[i],i);
      }
      return buf;
}
