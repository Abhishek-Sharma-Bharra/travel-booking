CREATE UNIQUE INDEX "Booking_leadId_agencyId_key" ON "Booking"("leadId","agencyId");
CREATE UNIQUE INDEX "Booking_quoteId_leadId_agencyId_key" ON "Booking"("quoteId","leadId","agencyId");
