"""Reproducible synthetic-only logistic regression. No agency records are read."""
from pathlib import Path
import json
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, brier_score_loss, accuracy_score

rng = np.random.default_rng(20261024)
n = 8000
X = np.column_stack([rng.uniform(.25, 2, n), rng.integers(0, 366, n), rng.integers(1, 21, n), rng.uniform(0, 168, n), rng.integers(0, 2, n), rng.integers(0, 2, n)])
# A fictional data-generating process, not a business fact or causal model.
logits = -1.5 + 1.4*X[:,0] - .002*X[:,1] + .018*X[:,2] - .018*X[:,3] + .65*X[:,4] + .9*X[:,5]
y = rng.binomial(1, 1 / (1 + np.exp(-logits)))
train, test = train_test_split(np.arange(n), test_size=.25, random_state=42, stratify=y)
mean = X[train].mean(axis=0); scale = X[train].std(axis=0)
model = LogisticRegression(C=1.0, max_iter=1000, random_state=42).fit((X[train]-mean)/scale,y[train])
p = model.predict_proba((X[test]-mean)/scale)[:,1]
root=Path(__file__).resolve().parent
artifact = {'version':'synthetic-logit-20261024-v1','label':'Demo model — not validated on your agency','features':['budgetFit','daysToDeparture','travellers','firstResponseHours','repeatCustomer','itineraryRequested'],'ranges':[[.25,2],[0,365],[1,20],[0,168],[0,1],[0,1]],'mean':mean.tolist(),'scale':scale.tolist(),'coefficients':model.coef_[0].tolist(),'intercept':float(model.intercept_[0])}
(root/'model.json').write_text(json.dumps(artifact,indent=2)+'\n')
metrics={'dataset':'synthetic only','seed':20261024,'train_rows':len(train),'held_out_rows':len(test),'roc_auc':roc_auc_score(y[test],p),'brier_score':brier_score_loss(y[test],p),'accuracy_at_0_5':accuracy_score(y[test],p>=.5),'warning':'Performance on synthetic held-out data is not evidence of accuracy on real agency enquiries.'}
(root/'evaluation.json').write_text(json.dumps(metrics,indent=2)+'\n')
fixtures=[{'inputs':X[i].tolist(),'probability':float(model.predict_proba(((X[i]-mean)/scale).reshape(1,-1))[0,1])} for i in test[:80]]
(root/'parity.json').write_text(json.dumps(fixtures,indent=2)+'\n')
print(json.dumps(metrics,indent=2))
