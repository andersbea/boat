import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BoatingMapComponent } from './boating-map.component';

describe('BoatingMapComponent', () => {
  let component: BoatingMapComponent;
  let fixture: ComponentFixture<BoatingMapComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BoatingMapComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BoatingMapComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
