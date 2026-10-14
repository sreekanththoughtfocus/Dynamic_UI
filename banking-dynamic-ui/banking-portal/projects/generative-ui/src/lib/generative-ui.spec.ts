import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GenerativeUi } from './generative-ui';

describe('GenerativeUi', () => {
  let component: GenerativeUi;
  let fixture: ComponentFixture<GenerativeUi>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GenerativeUi],
    }).compileComponents();

    fixture = TestBed.createComponent(GenerativeUi);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
