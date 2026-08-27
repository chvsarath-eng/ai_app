import json

with open('api_notebook.ipynb', 'r', encoding='utf-8') as f:
    nb = json.load(f)

for i, cell in enumerate(nb['cells']):
    if cell['cell_type'] == 'code':
        source = ''.join(cell['source'])
        if 'V2 CLOUD RUN TEST: 4-Character Family Story' in source:
            print(f'Cell index: {i}')
            # Find the source lines we need to replace
            for j, line in enumerate(cell['source']):
                if 'STORY_PROMPT = (' in line:
                    print(f'  STORY_PROMPT starts at source line: {j}')
                if 'CHARACTER_METADATA = json.dumps' in line:
                    print(f'  CHARACTER_METADATA starts at source line: {j}')
            break
