# Subtraction adds. Every individual number still looks like a number, which is
# what makes an arithmetic bug in a derived field so quiet.
# Reddens: custom-field-types: "the server computes it from the other fields — (500 - 125) * 2 is 750, with precedence honoured"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/formula.ts'
a = "      if (eat('+')) left = left + term()\n      else if (eat('-')) left = left - term()\n"
b = "      if (eat('+')) left = left + term()\n      else if (eat('-')) left = left + term()\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('formula.ts: subtraction now adds.')
