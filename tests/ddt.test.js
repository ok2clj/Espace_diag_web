import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDdt} from '../dist/vendor/ddt.js';
function ecu(def,pos={firstbyte:4,bitoffset:0},endian='Big'){return parseDdt(JSON.stringify({ecuname:'Fixture',obd:{send_id:'7E0',recv_id:'7E8',protocol:'CAN'},endian,data:{test:def},requests:[{name:'Read',sentbytes:'22F100',receivebyte_dataitems:{test:pos}}]}),'test.json');}
test('DDT MSB offsets and scaling',()=>{const e=ecu({bitscount:3,scaled:true,step:.5,offset:1},{firstbyte:4,bitoffset:2});assert.equal(e.decode(e.reads()[0],'62f10038')[0].value,'4.50');});
test('DDT signed 32-bit and per-item endian',()=>{const e=ecu({bitscount:32,signed:true});assert.equal(e.decode(e.reads()[0],'62f100fffffffe')[0].raw,-2);const l=ecu({bitscount:16},{firstbyte:4,endian:'Little'});assert.equal(l.decode(l.reads()[0],'62f1003412')[0].raw,0x1234);});
test('DDT truncation fails instead of inventing zero values',()=>{const e=ecu({bitscount:16});assert.throws(()=>e.decode(e.reads()[0],'62f10001'),/too short/);});
test('DDT ASCII and enum',()=>{const a=ecu({bytesascii:true,bytescount:3});assert.equal(a.decode(a.reads()[0],'62f100414243')[0].value,'ABC');const e=ecu({bitscount:8,lists:{'1':'Aktivní'}});assert.equal(e.decode(e.reads()[0],'62f10001')[0].value,'Aktivní');});
test('DDT rejects unverified packed little endian and invalid imports',()=>{const e=ecu({bitscount:3},{firstbyte:4,bitoffset:2},'Little');assert.throws(()=>e.decode(e.reads()[0],'62f10038'),/not verified/);assert.throws(()=>parseDdt('{"obd":{},"requests":{}}','bad'),/not a DDT/);});
test('Synthetic DDT definition retains hardware-exclusion flag',()=>{const e=parseDdt(JSON.stringify({demoOnly:true,ecuname:'Simulation',obd:{},requests:[]}),'demo.json');assert.equal(e.demoOnly,true);});
