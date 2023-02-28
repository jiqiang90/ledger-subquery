# Python program to read
# json file


import json

f = open('/home/jiri/fetchhub/genesis.json')
data = json.load(f)

f.close()
